
export enum VoteLevel1 {
  KHONG_HOAN_THANH = "Không hoàn thành",
  HOAN_THANH = "Hoàn thành",
  HOAN_THANH_TOT = "Hoàn thành tốt"
}

export interface Voter {
  cccd: string;
  mssv: string;
  hoTen: string;
  ngayVaoDang: string;
  loaiDangVien: string; // Chính thức / Dự bị
  nhom: string;
  hasVotedPhase1?: boolean;
  voteTimePhase1?: string; // Thời gian vote P1 (ISO String)
  hasVotedPhase2?: boolean;
  voteTimePhase2?: string; // Thời gian vote P2 (ISO String)
}

export interface CandidatePhase1 extends Voter {
  khoa: string;
  lop?: string; // ADDED: Lớp sinh hoạt
  chucVu: string;
  diemHT: number;
  diemRL: number;
  thanhTich: string;
  tuDanhGia: string; // Tự đánh giá mức độ HTNV
  mucDeXuat?: string; // Mức đề xuất HTNV
}

export interface CandidatePhase2 extends CandidatePhase1 {
  chiBoDeXuat: string; // Mức hoàn thành đề xuất
}

// Storage for results
export interface VoteRecordPhase1 {
  voterCCCD: string;
  candidateCCCD: string;
  level: VoteLevel1;
}

export interface VoteRecordPhase2 {
  voterCCCD: string;
  candidateCCCD: string;
}

export interface Phase1DisplayConfig {
  showCCCD: boolean;
  showMSSV: boolean;
  showNgayVaoDang: boolean;
  showLoaiDangVien: boolean;
  showNhom: boolean;
  showKhoa: boolean;
  showLop: boolean; // ADDED
  showChucVu: boolean;
  showDiemHT: boolean;
  showDiemRL: boolean;
  showThanhTich: boolean;
  showTuDanhGia: boolean;
  showMucDeXuat: boolean; 
}

export interface Phase2DisplayConfig {
  showCCCD: boolean;
  showMSSV: boolean;
  showNgayVaoDang: boolean;
  showLoaiDangVien: boolean;
  showNhom: boolean;
  showKhoa: boolean;
  showLop: boolean; // ADDED
  showChucVu: boolean;
  showDiemHT: boolean;
  showDiemRL: boolean;
  showThanhTich: boolean;
  showChiBoDeXuat: boolean;
  showTuDanhGia: boolean;
}

export interface SystemConfig {
  maxExcellentVotes: number; // Max votes for Phase 2
  totalOfficialVoters: number; // Tổng số Đảng viên chính thức (để tính tỷ lệ)
  allowReview: boolean; // Cho phép cử tri xem lại kết quả CỦA MÌNH sau khi vote
  allowViewResults: boolean; // Cho phép cử tri xem TOÀN BỘ KẾT QUẢ sau khi vote
  allowBulkVoteP1?: boolean; // Cho phép vote nhanh hàng loạt ở P1
  isPhase1Open: boolean;
  isPhase2Open: boolean;
  p1Display: Phase1DisplayConfig;
  p2Display: Phase2DisplayConfig;
}

// Data store shape
export interface AppData {
  voters: Voter[];
  candidatesP1: CandidatePhase1[];
  candidatesP2: CandidatePhase2[];
  votesP1: VoteRecordPhase1[];
  votesP2: VoteRecordPhase2[];
  config: SystemConfig;
}