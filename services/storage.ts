import { AppData, VoteLevel1, VoteRecordPhase1, VoteRecordPhase2 } from '../types';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, update, get, child, off } from 'firebase/database';
import { firebaseConfig, isFirebaseConfigured } from './firebaseConfig';

const LOCAL_KEY = 'DANG_VIEN_VOTE_DB_V3_OPTIMIZED';

// Khởi tạo dữ liệu mặc định
const INITIAL_DATA: AppData = {
  voters: [],
  candidatesP1: [],
  candidatesP2: [],
  votesP1: [],
  votesP2: [],
  config: {
    maxExcellentVotes: 5,
    totalOfficialVoters: 0,
    allowReview: true,
    allowViewResults: false,
    allowBulkVoteP1: true,
    allowBulkVoteP2: true, // NEW Default
    isPhase1Open: true,
    isPhase2Open: true,
    p1Display: {
      showCCCD: false,
      showMSSV: true,
      showNgayVaoDang: false,
      showLoaiDangVien: true,
      showNhom: true,
      showKhoa: true,
      showLop: true, // ADDED default true
      showChucVu: true,
      showDiemHT: true,
      showDiemRL: true,
      showThanhTich: true, // Changed to true based on user feedback request
      showTuDanhGia: true,
      showMucDeXuat: true,
    },
    p2Display: {
      showCCCD: false,
      showMSSV: true,
      showNgayVaoDang: false,
      showLoaiDangVien: false,
      showNhom: true,
      showKhoa: true,
      showLop: true, // ADDED default true
      showChucVu: true,
      showDiemHT: true,
      showDiemRL: true,
      showThanhTich: true,
      showChiBoDeXuat: true,
      showTuDanhGia: true,
    }
  }
};

let _inMemoryDB: AppData = JSON.parse(JSON.stringify(INITIAL_DATA));
let _db: any = null;
let _isAdminMode = false; // Flag để biết có cần tải toàn bộ vote không

// --- Helper Functions ---
const normalize = (val: any) => String(val || '').trim();
const notifyUpdate = () => window.dispatchEvent(new Event('db_update'));

// SORTING LOGIC ADDED HERE
const getPositionRank = (pos: string = ''): number => {
    const p = pos.toLowerCase().trim();
    if (!p) return 100;
    if (p === 'bí thư' || (p.includes('bí thư') && !p.includes('phó'))) return 1;
    if (p.includes('phó bí thư')) return 2;
    if (p.includes('chi ủy viên') || p.includes('uvbch')) return 3;
    if (p.includes('tổ trưởng')) return 4;
    if (p.includes('tổ phó')) return 5;
    if (p.includes('đảng viên')) return 10;
    return 50; // Other roles
};

const sortCandidatesByRank = (list: any[]) => {
    if (!Array.isArray(list)) return [];
    return [...list].sort((a, b) => {
        const rankA = getPositionRank(a.chucVu);
        const rankB = getPositionRank(b.chucVu);
        
        // 1. Ưu tiên chức vụ (nhỏ lên đầu)
        if (rankA !== rankB) return rankA - rankB;
        
        // 2. Nếu cùng chức vụ (thường là Đảng viên), sắp xếp theo Khóa
        const khoaA = String(a.khoa || '').trim();
        const khoaB = String(b.khoa || '').trim();
        
        if (khoaA !== khoaB) {
             // Sắp xếp khóa tăng dần (Ví dụ K45 -> K46)
             return khoaA.localeCompare(khoaB, 'vi', { numeric: true });
        }

        // 3. Cuối cùng sắp xếp theo Tên
        return (a.hoTen || '').localeCompare(b.hoTen || '', 'vi');
    });
};

const sortCandidatesP2 = (list: any[]) => {
    if (!Array.isArray(list)) return [];
    return [...list].sort((a, b) => {
        // 1. Ưu tiên có Chi bộ đề xuất (chiBoDeXuat)
        const dxA = String(a.chiBoDeXuat || '').trim();
        const dxB = String(b.chiBoDeXuat || '').trim();
        
        const hasDxA = dxA.length > 0;
        const hasDxB = dxB.length > 0;

        // Người có đề xuất lên trước
        if (hasDxA !== hasDxB) {
            return hasDxA ? -1 : 1;
        }

        // Nếu cùng có đề xuất, sắp xếp theo tên đề xuất (A-Z) để gom nhóm
        if (hasDxA) { 
             const cmp = dxA.localeCompare(dxB, 'vi');
             if (cmp !== 0) return cmp;
        }

        // 2. Tiếp theo là Chức vụ (Position Rank)
        const rankA = getPositionRank(a.chucVu);
        const rankB = getPositionRank(b.chucVu);
        if (rankA !== rankB) return rankA - rankB;

        // 3. Khóa
        const khoaA = String(a.khoa || '').trim();
        const khoaB = String(b.khoa || '').trim();
        if (khoaA !== khoaB) return khoaA.localeCompare(khoaB, 'vi', { numeric: true });

        // 4. Tên
        return (a.hoTen || '').localeCompare(b.hoTen || '', 'vi');
    });
};

const mergeConfig = (base: any, incoming: any) => {
    if (!incoming) return base;
    const result = { ...base, ...incoming };
    if (base.p1Display && incoming.p1Display) result.p1Display = { ...base.p1Display, ...incoming.p1Display };
    if (base.p2Display && incoming.p2Display) result.p2Display = { ...base.p2Display, ...incoming.p2Display };
    return result;
};

const handleFirebaseError = (e: any) => {
    console.error("Firebase Error:", e);
    const msg = (e.message || JSON.stringify(e)).toLowerCase();
    if (msg.includes("permission_denied") || msg.includes("permission denied")) {
        alert("LỖI QUYỀN TRUY CẬP! Dữ liệu của bạn chưa được lưu. Vui lòng thử lại hoặc báo Admin.");
    }
};

// --- Initialization ---
const initStorage = () => {
    if (isFirebaseConfigured()) {
        try {
            const app = initializeApp(firebaseConfig);
            _db = getDatabase(app);
            
            // 1. Chỉ lắng nghe Config & Static Data (Nhẹ)
            onValue(ref(_db, 'app_data/config'), (snap) => {
                if (snap.exists()) {
                    _inMemoryDB.config = mergeConfig(INITIAL_DATA.config, snap.val());
                    notifyUpdate();
                }
            });

            onValue(ref(_db, 'app_data/voters'), (snap) => {
                if (snap.exists()) {
                    const val = snap.val();
                    const voters = Array.isArray(val) ? val : Object.values(val);
                    // Giữ lại trạng thái vote nếu đang có trong memory (để tránh UI bị nháy)
                    _inMemoryDB.voters = voters.map((v: any) => {
                        const exist = _inMemoryDB.voters.find(old => old.cccd === v.cccd);
                        return exist ? { ...v, hasVotedPhase1: exist.hasVotedPhase1, hasVotedPhase2: exist.hasVotedPhase2, voteTimePhase1: exist.voteTimePhase1, voteTimePhase2: exist.voteTimePhase2 } : v;
                    });
                    notifyUpdate();
                }
            });

            onValue(ref(_db, 'app_data/candidatesP1'), (snap) => {
                if (snap.exists()) {
                    const val = snap.val();
                    const list = Array.isArray(val) ? val : Object.values(val);
                    _inMemoryDB.candidatesP1 = sortCandidatesByRank(list); // Apply sort P1
                    notifyUpdate();
                }
            });

            onValue(ref(_db, 'app_data/candidatesP2'), (snap) => {
                if (snap.exists()) {
                    const val = snap.val();
                    const list = Array.isArray(val) ? val : Object.values(val);
                    _inMemoryDB.candidatesP2 = sortCandidatesP2(list); // Apply sort P2
                    notifyUpdate();
                }
            });

        } catch (e) {
            console.error("Lỗi kết nối Firebase:", e);
            loadFromLocal();
        }
    } else {
        loadFromLocal();
    }
};

const loadFromLocal = () => {
    try {
        const str = localStorage.getItem(LOCAL_KEY);
        if (str) {
            const parsed = JSON.parse(str);
            _inMemoryDB = { ...INITIAL_DATA, ...parsed };
            if (parsed.config) _inMemoryDB.config = mergeConfig(INITIAL_DATA.config, parsed.config);
            
            // Apply Sort immediately on load
            if (_inMemoryDB.candidatesP1) _inMemoryDB.candidatesP1 = sortCandidatesByRank(_inMemoryDB.candidatesP1);
            if (_inMemoryDB.candidatesP2) _inMemoryDB.candidatesP2 = sortCandidatesP2(_inMemoryDB.candidatesP2);
        }
        notifyUpdate();
    } catch (e) { console.error(e); }
};

initStorage();

// --- Public API ---

// Admin gọi hàm này để bắt đầu lắng nghe toàn bộ phiếu bầu
export const subscribeToRealtimeVotes = () => {
    if (!isFirebaseConfigured() || !_db) return;
    if (_isAdminMode) return; // Đã subscribe rồi
    _isAdminMode = true;

    console.log("Admin Mode: Subscribing to all votes...");

    // Lắng nghe Vote P1
    onValue(ref(_db, 'votes_p1'), (snap) => {
        if (snap.exists()) {
            const val = snap.val();
            const flatVotes: VoteRecordPhase1[] = [];
            
            Object.keys(val).forEach(voterID => {
                const voterVotes = val[voterID];
                if (voterVotes) {
                    Object.values(voterVotes).forEach((vote: any) => {
                        if (vote && vote.candidateCCCD && vote.level) {
                            flatVotes.push(vote);
                        }
                    });
                }
            });

            _inMemoryDB.votesP1 = flatVotes;
            
            // Sync status ngược lại voters cho Admin view
            const votedCCCDs = new Set(flatVotes.map(v => normalize(v.voterCCCD)));
            _inMemoryDB.voters = _inMemoryDB.voters.map(v => ({
                ...v,
                hasVotedPhase1: votedCCCDs.has(normalize(v.cccd))
            }));
            
            notifyUpdate();
        } else {
            _inMemoryDB.votesP1 = [];
            notifyUpdate();
        }
    });

    // Lắng nghe Vote P2
    onValue(ref(_db, 'votes_p2'), (snap) => {
        if (snap.exists()) {
            const val = snap.val();
            const raw = Object.values(val) as any[];
            let flatVotes: VoteRecordPhase2[] = [];
            raw.forEach((r: any) => {
                if (r.votes && Array.isArray(r.votes)) {
                    flatVotes = [...flatVotes, ...r.votes];
                }
            });
            _inMemoryDB.votesP2 = flatVotes;

            const votedCCCDs = new Set(raw.map(r => normalize(r.voterCCCD)));
            _inMemoryDB.voters = _inMemoryDB.voters.map(v => ({
                ...v,
                hasVotedPhase2: votedCCCDs.has(normalize(v.cccd))
            }));

            notifyUpdate();
        } else {
            _inMemoryDB.votesP2 = [];
            notifyUpdate();
        }
    });
};

export const getDB = (): AppData => JSON.parse(JSON.stringify(_inMemoryDB));

export const checkVoterStatus = async (cccd: string) => {
    if (!isFirebaseConfigured() || !_db) return;
    const safeCCCD = normalize(cccd);
    
    // Check P1
    try {
        const p1Snap = await get(child(ref(_db), `votes_p1/${safeCCCD}`));
        if (p1Snap.exists()) {
            const existingVoterIdx = _inMemoryDB.voters.findIndex(v => normalize(v.cccd) === safeCCCD);
            if (existingVoterIdx !== -1) {
                _inMemoryDB.voters[existingVoterIdx].hasVotedPhase1 = true;
                _inMemoryDB.voters[existingVoterIdx].voteTimePhase1 = new Date().toISOString(); 
            }
        } else {
             // Ensure reset if not found (in case of manual deletion by admin)
             const existingVoterIdx = _inMemoryDB.voters.findIndex(v => normalize(v.cccd) === safeCCCD);
             if (existingVoterIdx !== -1) {
                 _inMemoryDB.voters[existingVoterIdx].hasVotedPhase1 = false;
             }
        }
        
        const p2Snap = await get(child(ref(_db), `votes_p2/${safeCCCD}`));
        if (p2Snap.exists()) {
            const existingVoterIdx = _inMemoryDB.voters.findIndex(v => normalize(v.cccd) === safeCCCD);
            if (existingVoterIdx !== -1) {
                _inMemoryDB.voters[existingVoterIdx].hasVotedPhase2 = true;
            }
        } else {
             const existingVoterIdx = _inMemoryDB.voters.findIndex(v => normalize(v.cccd) === safeCCCD);
             if (existingVoterIdx !== -1) {
                 _inMemoryDB.voters[existingVoterIdx].hasVotedPhase2 = false;
             }
        }
        notifyUpdate();
    } catch (e) {
        console.error("Error checking voter status", e);
    }
};

export const saveDB = async (data: AppData): Promise<boolean> => {
    // FORCE SORT BEFORE SAVING
    if (data.candidatesP1) data.candidatesP1 = sortCandidatesByRank(data.candidatesP1);
    if (data.candidatesP2) data.candidatesP2 = sortCandidatesP2(data.candidatesP2); // Use P2 Sort

    _inMemoryDB = data;
    notifyUpdate();
    if (isFirebaseConfigured() && _db) {
        try {
            const updates: any = {};
            updates['app_data/config'] = data.config;
            updates['app_data/voters'] = data.voters;
            updates['app_data/candidatesP1'] = data.candidatesP1;
            updates['app_data/candidatesP2'] = data.candidatesP2;
            
            await update(ref(_db), updates);
            return true;
        } catch (e) { handleFirebaseError(e); return false; }
    } else {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
        return true;
    }
};

export const forcePushToCloud = async (): Promise<{success: boolean, message: string}> => {
    if (!isFirebaseConfigured() || !_db) return { success: false, message: "No connection" };
    try {
        const updates: any = {};
        updates['app_data'] = {
            config: _inMemoryDB.config,
            voters: _inMemoryDB.voters,
            candidatesP1: _inMemoryDB.candidatesP1,
            candidatesP2: _inMemoryDB.candidatesP2
        };
        await update(ref(_db), updates);
        return { success: true, message: "Đã đồng bộ Config & List thành công." };
    } catch (e: any) { return { success: false, message: e.message }; }
};

export const resetDB = async (silent = false) => {
    if (silent || confirm("CẢNH BÁO: XÓA TOÀN BỘ DỮ LIỆU?")) {
        if (isFirebaseConfigured() && _db) {
            const updates: any = {};
            updates['app_data'] = INITIAL_DATA; 
            updates['votes_p1'] = null; 
            updates['votes_p2'] = null; 
            await update(ref(_db), updates);
        } else {
            await saveDB(JSON.parse(JSON.stringify(INITIAL_DATA)));
        }
        if (!silent) window.location.reload();
    }
};

export const resetPhase1 = async (): Promise<boolean> => {
    const db = getDB();
    db.candidatesP1 = [];
    if (isFirebaseConfigured() && _db) {
        const updates: any = {};
        updates['app_data/candidatesP1'] = [];
        updates['votes_p1'] = null;
        db.voters.forEach(v => { v.hasVotedPhase1 = false; });
        updates['app_data/voters'] = db.voters;
        await update(ref(_db), updates);
        return true;
    }
    return await saveDB(db);
};

export const resetPhase2 = async (): Promise<boolean> => {
    const db = getDB();
    db.candidatesP2 = [];
    if (isFirebaseConfigured() && _db) {
        const updates: any = {};
        updates['app_data/candidatesP2'] = [];
        updates['votes_p2'] = null;
        db.voters.forEach(v => { v.hasVotedPhase2 = false; });
        updates['app_data/voters'] = db.voters;
        await update(ref(_db), updates);
        return true;
    }
    return await saveDB(db);
};

export const resetVotersOnly = async (): Promise<boolean> => {
    if (isFirebaseConfigured() && _db) {
        const updates: any = {};
        updates['app_data/voters'] = [];
        updates['votes_p1'] = null;
        updates['votes_p2'] = null;
        await update(ref(_db), updates);
        return true;
    }
    const db = getDB(); db.voters = []; db.votesP1 = []; db.votesP2 = [];
    return await saveDB(db);
};

export const resetSpecificVoterPhase = async (voterCCCD: string, phase: 'p1' | 'p2'): Promise<boolean> => {
    const safeID = normalize(voterCCCD);
    if (isFirebaseConfigured() && _db) {
        try {
            const updates: any = {};
            // 1. Delete actual vote records
            updates[`votes_${phase}/${safeID}`] = null;
            
            // 2. Update status in app_data/voters/INDEX (reset flag & timestamp)
            const vIdx = _inMemoryDB.voters.findIndex(v => normalize(v.cccd) === safeID);
            if (vIdx !== -1) {
                const pathPrefix = `app_data/voters/${vIdx}`;
                if (phase === 'p1') {
                    updates[`${pathPrefix}/hasVotedPhase1`] = false;
                    updates[`${pathPrefix}/voteTimePhase1`] = null; // Explicitly nullify timestamp
                    
                    // Optimistic update in memory
                    _inMemoryDB.voters[vIdx].hasVotedPhase1 = false;
                    delete _inMemoryDB.voters[vIdx].voteTimePhase1;
                } else {
                    updates[`${pathPrefix}/hasVotedPhase2`] = false;
                    updates[`${pathPrefix}/voteTimePhase2`] = null; // Explicitly nullify timestamp

                    // Optimistic update in memory
                    _inMemoryDB.voters[vIdx].hasVotedPhase2 = false;
                    delete _inMemoryDB.voters[vIdx].voteTimePhase2;
                }
            }
            await update(ref(_db), updates);
            notifyUpdate(); // Notify listeners to refresh UI immediately
            return true;
        } catch(e) { handleFirebaseError(e); return false; }
    } else {
        // Local / Offline mode
        const db = getDB();
        const idx = db.voters.findIndex(v => normalize(v.cccd) === safeID);
        if (idx !== -1) {
            if (phase === 'p1') {
                db.voters[idx].hasVotedPhase1 = false;
                delete db.voters[idx].voteTimePhase1;
                db.votesP1 = db.votesP1.filter(v => normalize(v.voterCCCD) !== safeID);
            } else {
                db.voters[idx].hasVotedPhase2 = false;
                delete db.voters[idx].voteTimePhase2;
                db.votesP2 = db.votesP2.filter(v => normalize(v.voterCCCD) !== safeID);
            }
            return await saveDB(db);
        }
        return true;
    }
};

// --- OPTIMIZED VOTING (User Write Only to Their Node) ---

export const castVoteP1 = async (voterCCCD: string, votes: { candidateCCCD: string, level: VoteLevel1 }[]): Promise<boolean> => {
    const safeID = normalize(voterCCCD);
    const now = new Date().toISOString();

    if (isFirebaseConfigured() && _db) {
        try {
            const updates: any = {};
            
            // FIX: CHỈ GHI VÀO NODE votes_p1 CỦA USER
            // Không ghi vào app_data/voters để tránh lỗi Permission Denied nếu user thường không có quyền ghi root
            
            const finalVotes = votes.map(v => ({
                voterCCCD: safeID,
                candidateCCCD: normalize(v.candidateCCCD),
                level: v.level
            }));

            // Lưu toàn bộ mảng vote vào node của voter
            updates[`votes_p1/${safeID}`] = finalVotes;

            await update(ref(_db), updates);
            
            // Cập nhật local memory ngay lập tức để UI chuyển trang
            const vIdx = _inMemoryDB.voters.findIndex(v => normalize(v.cccd) === safeID);
            if (vIdx !== -1) {
                _inMemoryDB.voters[vIdx].hasVotedPhase1 = true;
                _inMemoryDB.voters[vIdx].voteTimePhase1 = now;
            }
            
            return true;
        } catch (e) {
            handleFirebaseError(e);
            return false;
        }
    } else {
        // Offline Fallback
        const db = getDB();
        const idx = db.voters.findIndex(v => normalize(v.cccd) === safeID);
        if (idx !== -1) {
            db.voters[idx].hasVotedPhase1 = true;
            db.votesP1 = db.votesP1.filter(v => normalize(v.voterCCCD) !== safeID);
            votes.forEach(v => db.votesP1.push({ voterCCCD: safeID, candidateCCCD: normalize(v.candidateCCCD), level: v.level }));
            return await saveDB(db);
        }
        return false;
    }
};

export const castVoteP2 = async (voterCCCD: string, selectedCandidatesCCCD: string[]): Promise<boolean> => {
    const safeID = normalize(voterCCCD);
    const now = new Date().toISOString();

    if (isFirebaseConfigured() && _db) {
        try {
            const updates: any = {};
            
            // FIX: CHỈ GHI VÀO NODE votes_p2 CỦA USER
            const voteRecord = {
                voterCCCD: safeID,
                votes: selectedCandidatesCCCD.map(c => ({
                    voterCCCD: safeID,
                    candidateCCCD: normalize(c)
                })),
                timestamp: now
            };
            updates[`votes_p2/${safeID}`] = voteRecord;

            await update(ref(_db), updates);

            const vIdx = _inMemoryDB.voters.findIndex(v => normalize(v.cccd) === safeID);
            if (vIdx !== -1) {
                _inMemoryDB.voters[vIdx].hasVotedPhase2 = true;
                _inMemoryDB.voters[vIdx].voteTimePhase2 = now;
            }
            return true;
        } catch (e) {
            handleFirebaseError(e);
            return false;
        }
    } else {
        // Offline Fallback
        const db = getDB();
        const idx = db.voters.findIndex(v => normalize(v.cccd) === safeID);
        if (idx !== -1) {
            db.voters[idx].hasVotedPhase2 = true;
            db.votesP2 = db.votesP2.filter(v => normalize(v.voterCCCD) !== safeID);
            selectedCandidatesCCCD.forEach(c => db.votesP2.push({ voterCCCD: safeID, candidateCCCD: normalize(c) }));
            return await saveDB(db);
        }
        return false;
    }
};

// NEW: Hàm lấy lại kết quả vote của chính cử tri (Để xem lại)
export const getVoterVotes = async (cccd: string): Promise<{p1: any[], p2: string[]}> => {
    const safeCCCD = normalize(cccd);
    let p1Res: any[] = [];
    let p2Res: string[] = []; // List of candidate CCCDs

    if (isFirebaseConfigured() && _db) {
        try {
            const p1Snap = await get(child(ref(_db), `votes_p1/${safeCCCD}`));
            if (p1Snap.exists()) {
                 p1Res = p1Snap.val(); // Array of {candidateCCCD, level, voterCCCD}
            }

            const p2Snap = await get(child(ref(_db), `votes_p2/${safeCCCD}`));
            if (p2Snap.exists()) {
                const val = p2Snap.val();
                if (val && val.votes) {
                    p2Res = val.votes.map((v:any) => v.candidateCCCD);
                }
            }
        } catch(e) { console.error(e); }
    } else {
        // Offline / Local storage fallback
        const db = getDB();
        p1Res = db.votesP1.filter(v => normalize(v.voterCCCD) === safeCCCD);
        p2Res = db.votesP2.filter(v => normalize(v.voterCCCD) === safeCCCD).map(v => v.candidateCCCD);
    }
    return { p1: p1Res, p2: p2Res };
}