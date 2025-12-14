import React, { useState, useEffect, useMemo } from 'react';
import { getDB, castVoteP1, castVoteP2, checkVoterStatus, getVoterVotes } from '../services/storage';
import { AppData, Voter, CandidatePhase1, CandidatePhase2, VoteLevel1 } from '../types';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Zap, Search, LogOut, CheckCircle, AlertCircle, User, Loader2, Send, Star, FileText, Eye, EyeOff, Award, Filter, ThumbsUp, X, Check, GraduationCap, Users, Briefcase, BookOpen, Activity, School, UserCheck, Wifi, ArrowLeft } from 'lucide-react';

interface VoterPageProps {
  onLogout: () => void;
}

export const VoterPage: React.FC<VoterPageProps> = ({ onLogout }) => {
  // State
  const [db, setDb] = useState<AppData>(getDB());
  const [cccdInput, setCccdInput] = useState('');
  const [currentUser, setCurrentUser] = useState<Voter | null>(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{msg: string, type: 'success'|'error'} | null>(null);
  
  // Voting State
  const [votesP1, setVotesP1] = useState<Record<string, VoteLevel1>>({});
  const [votesP2, setVotesP2] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [hideVotedP1, setHideVotedP1] = useState(false);
  const [hideSelectedP2, setHideSelectedP2] = useState(false);
  
  // NEW FILTERS
  const [filterKhoa, setFilterKhoa] = useState<string>('all');
  const [filterNhom, setFilterNhom] = useState<string>('all'); // Added Nhom Filter
  const [filterDeXuat, setFilterDeXuat] = useState<string>('all');
  
  // UI State for long text expansion
  const [expandedText, setExpandedText] = useState<Record<string, boolean>>({});

  // Review State
  const [reviewData, setReviewData] = useState<{p1: any[], p2: string[]} | null>(null);
  const [showReview, setShowReview] = useState(false);

  // Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    onConfirm: () => void;
    className?: string; // Added for custom width
  }>({ isOpen: false, title: '', message: null, onConfirm: () => {} });

  // Sync DB
  useEffect(() => {
    const handleUpdate = () => setDb(getDB());
    window.addEventListener('db_update', handleUpdate);
    return () => window.removeEventListener('db_update', handleUpdate);
  }, []);

  const showNotify = (msg: string, type: 'success'|'error' = 'success') => {
      setNotification({ msg, type });
      setTimeout(() => setNotification(null), 3000);
  };

  const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!cccdInput.trim()) return;
      
      setLoading(true);
      await checkVoterStatus(cccdInput); // Sync latest status from Firebase
      const currentDb = getDB();
      const voter = currentDb.voters.find(v => v.cccd === cccdInput.trim() || v.mssv === cccdInput.trim()); // Allow MSSV login too
      
      setLoading(false);
      
      if (voter) {
          setCurrentUser(voter);
      } else {
          showNotify("Không tìm thấy thông tin cử tri!", "error");
      }
  };

  const determineStep = (): 'p1' | 'p2' | 'completed' | 'closed' => {
      if (!currentUser) return 'closed';
      if (db.config.isPhase1Open && !currentUser.hasVotedPhase1) return 'p1';
      if (db.config.isPhase2Open && !currentUser.hasVotedPhase2) return 'p2';
      if (db.config.isPhase1Open && currentUser.hasVotedPhase1 && !db.config.isPhase2Open) return 'completed';
      if (db.config.isPhase2Open && currentUser.hasVotedPhase2) return 'completed';
      if (!db.config.isPhase1Open && !db.config.isPhase2Open) return 'closed';
      return 'completed';
  };

  const step = determineStep();

  // Extract unique values for filters (Works for both P1 and P2 based on current step)
  const uniqueKhoa = useMemo(() => {
      const source = step === 'p1' ? db.candidatesP1 : db.candidatesP2;
      const items = new Set(source.map(c => c.khoa).filter(Boolean));
      return Array.from(items).sort();
  }, [db.candidatesP1, db.candidatesP2, step]);

  const uniqueNhom = useMemo(() => {
      const source = step === 'p1' ? db.candidatesP1 : db.candidatesP2;
      const items = new Set(source.map(c => c.nhom).filter(Boolean));
      return Array.from(items).sort();
  }, [db.candidatesP1, db.candidatesP2, step]);

  const uniqueDeXuat = useMemo(() => {
    if (step !== 'p1') return [];
    const items = new Set(db.candidatesP1.map(c => c.mucDeXuat).filter(Boolean));
    return Array.from(items).sort();
  }, [db.candidatesP1, step]);


  // --- Handlers P1 ---
  const visibleCandidatesP1 = useMemo(() => {
      return db.candidatesP1.filter(c => {
          const matchesSearch = c.hoTen.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                c.mssv.toLowerCase().includes(searchTerm.toLowerCase());
          if (!matchesSearch) return false;
          if (hideVotedP1 && votesP1[c.cccd]) return false;
          
          // Apply Filters
          if (filterKhoa !== 'all' && c.khoa !== filterKhoa) return false;
          if (filterNhom !== 'all' && c.nhom !== filterNhom) return false;
          if (filterDeXuat !== 'all' && c.mucDeXuat !== filterDeXuat) return false;

          return true;
      });
  }, [db.candidatesP1, searchTerm, hideVotedP1, votesP1, filterKhoa, filterNhom, filterDeXuat]);

  const handleVoteP1Change = (candidateCCCD: string, level: VoteLevel1) => {
      setVotesP1(prev => ({ ...prev, [candidateCCCD]: level }));
  };

  const handleVoteByProposal = () => {
      const newVotes = { ...votesP1 };
      let count = 0;
      visibleCandidatesP1.forEach(c => {
          if (c.mucDeXuat) {
             const level = Object.values(VoteLevel1).find(v => v === c.mucDeXuat);
             if (level) {
                 newVotes[c.cccd] = level;
                 count++;
             }
          }
      });
      setVotesP1(newVotes);
      showNotify(`Đã áp dụng mức đề xuất cho ${count} ứng viên.`);
  };

  const submitP1 = async () => {
      if (!currentUser) return;
      const missing = db.candidatesP1.filter(c => !votesP1[c.cccd]);
      if (missing.length > 0) {
          showNotify(`Bạn chưa đánh giá ${missing.length} người.`, "error");
          return;
      }
      setLoading(true);
      const payload = Object.entries(votesP1).map(([cCode, lvl]) => ({ candidateCCCD: cCode, level: lvl as VoteLevel1 }));
      const success = await castVoteP1(currentUser.cccd, payload);
      setLoading(false);
      if (success) {
          setCurrentUser(prev => prev ? ({ ...prev, hasVotedPhase1: true }) : null);
          showNotify("Gửi đánh giá thành công!");
      } else {
          showNotify("Lỗi gửi phiếu. Vui lòng thử lại.", "error");
      }
  };

  // --- Handlers P2 ---
  const visibleCandidatesP2 = useMemo(() => {
    return db.candidatesP2.filter(c => {
        const matchesSearch = c.hoTen.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              c.mssv.toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;
        
        // P2 Filter
        if (filterKhoa !== 'all' && c.khoa !== filterKhoa) return false;
        if (filterNhom !== 'all' && c.nhom !== filterNhom) return false;

        // Hide Selected Filter
        if (hideSelectedP2 && votesP2.includes(c.cccd)) return false;
        
        return true;
    });
  }, [db.candidatesP2, searchTerm, filterKhoa, filterNhom, hideSelectedP2, votesP2]);

  const toggleVoteP2 = (candidateCCCD: string) => {
      setVotesP2(prev => {
          if (prev.includes(candidateCCCD)) {
              return prev.filter(c => c !== candidateCCCD);
          } else {
              if (prev.length >= db.config.maxExcellentVotes) {
                  showNotify(`Chỉ được bầu tối đa ${db.config.maxExcellentVotes} người.`, "error");
                  return prev;
              }
              return [...prev, candidateCCCD];
          }
      });
  };

  const submitP2 = async () => {
      if (!currentUser) return;
      setLoading(true);
      const success = await castVoteP2(currentUser.cccd, votesP2);
      setLoading(false);
      if (success) {
        setCurrentUser(prev => prev ? ({ ...prev, hasVotedPhase2: true }) : null);
        showNotify("Gửi phiếu bầu thành công!");
      } else {
        showNotify("Lỗi gửi phiếu. Vui lòng thử lại.", "error");
      }
  };

  const handleShowReview = async () => {
      if (!currentUser) return;
      setLoading(true);
      const data = await getVoterVotes(currentUser.cccd);
      setReviewData(data);
      setLoading(false);
      setShowReview(true);
  };

  // --- Render ---

  if (!currentUser) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#fffef5]">
             {notification && <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded shadow-lg animate-bounce text-white ${notification.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>{notification.msg}</div>}
             
             {/* Login Card */}
             <div className="w-full max-w-[400px] bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-8 text-center">
                 
                 {/* Icon Container */}
                 <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-red-100">
                     <UserCheck className="w-8 h-8 text-[#BE1E2D]" />
                 </div>
                 
                 {/* Title & Subtitle */}
                 <h2 className="text-2xl font-black text-gray-800 mb-2">Đăng nhập hệ thống</h2>
                 <p className="text-gray-500 text-sm mb-8">Nhập CCCD hoặc Mã số sinh viên</p>
                 
                 <form onSubmit={handleLogin} className="space-y-4">
                     
                     {/* Status Indicator */}
                     <div className="w-full bg-[#E6F4EA] border border-[#CEEAD6] rounded-xl py-3 flex items-center justify-center gap-2 text-[#137333] font-bold text-sm">
                         <Wifi className="w-4 h-4" /> Hệ thống Online
                     </div>

                     {/* Input Field */}
                     <div>
                         <input 
                            type="text" 
                            className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-gray-800 placeholder-gray-400 focus:border-[#BE1E2D] focus:ring-4 focus:ring-red-50 outline-none transition-all text-center font-bold text-lg"
                            placeholder="Nhập mã số..."
                            value={cccdInput}
                            onChange={(e) => setCccdInput(e.target.value)}
                            autoFocus
                         />
                     </div>
                     
                     {/* Submit Button */}
                     <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full py-3.5 rounded-xl bg-[#BE1E2D] hover:bg-[#991B1B] text-white font-bold text-base shadow-lg shadow-red-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                     >
                         {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Xác thực & Bắt đầu"}
                     </button>
                     
                     {/* Footer Link */}
                     <div className="pt-4">
                         <button type="button" onClick={onLogout} className="text-sm text-gray-400 hover:text-gray-600 font-medium transition-colors">
                             Quay lại trang chủ
                         </button>
                     </div>
                 </form>
             </div>
        </div>
      );
  }

  // REVIEW MODE RENDER
  if (showReview && reviewData) {
      return (
          <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
              <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
                  <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
                      <button onClick={() => setShowReview(false)} className="flex items-center gap-2 text-gray-600 hover:text-[#BE1E2D] font-bold">
                          <ArrowLeft className="w-5 h-5"/> Quay lại
                      </button>
                      <div className="font-bold text-gray-800">Kết quả bầu cử của bạn</div>
                  </div>
              </header>
              
              <main className="flex-1 max-w-4xl mx-auto w-full p-4 space-y-6">
                  {/* P1 Results */}
                  {reviewData.p1.length > 0 && (
                      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                          <div className="p-4 bg-gray-50 border-b border-gray-100 font-bold text-[#BE1E2D] flex items-center gap-2">
                              <Activity className="w-5 h-5"/> Kết quả Đánh giá (Phần 1)
                          </div>
                          <div className="divide-y divide-gray-100">
                              {reviewData.p1.map((vote, idx) => {
                                  const candidate = db.candidatesP1.find(c => String(c.cccd).trim() === String(vote.candidateCCCD).trim());
                                  return (
                                      <div key={idx} className="p-3 flex items-center justify-between hover:bg-gray-50">
                                          <div className="text-sm font-medium text-gray-800">{candidate?.hoTen || vote.candidateCCCD}</div>
                                          <div className={`text-xs font-bold px-2 py-1 rounded border ${
                                              vote.level === VoteLevel1.HOAN_THANH_TOT ? 'bg-green-50 text-green-700 border-green-200' :
                                              vote.level === VoteLevel1.HOAN_THANH ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                              'bg-red-50 text-red-700 border-red-200'
                                          }`}>{vote.level}</div>
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                  )}

                  {/* P2 Results */}
                  {reviewData.p2.length > 0 && (
                      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                           <div className="p-4 bg-yellow-50 border-b border-yellow-100 font-bold text-yellow-800 flex items-center gap-2">
                              <Star className="w-5 h-5"/> Kết quả Bình bầu (Phần 2)
                          </div>
                          <div className="p-4 flex flex-wrap gap-2">
                              {reviewData.p2.map((cccd, idx) => {
                                  const candidate = db.candidatesP2.find(c => String(c.cccd).trim() === String(cccd).trim());
                                  return (
                                      <div key={idx} className="bg-yellow-100 text-yellow-900 px-3 py-1.5 rounded-full text-sm font-bold border border-yellow-200 shadow-sm flex items-center gap-2">
                                          <CheckCircle className="w-4 h-4"/> {candidate?.hoTen || cccd}
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                  )}
                  
                  {(reviewData.p1.length === 0 && reviewData.p2.length === 0) && (
                      <div className="text-center py-12 text-gray-400 italic">Không tìm thấy dữ liệu phiếu bầu.</div>
                  )}
              </main>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans pb-24">
      {notification && <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded shadow-lg animate-bounce text-white ${notification.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>{notification.msg}</div>}
      <Modal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal({...confirmModal, isOpen: false})} className={confirmModal.className} />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-[#BE1E2D] text-white rounded-full flex items-center justify-center font-bold text-base md:text-lg shadow-sm border-2 border-red-200 shrink-0">
                      {currentUser.hoTen.charAt(0)}
                  </div>
                  <div className="min-w-0">
                      <div className="font-bold text-gray-800 leading-tight">{currentUser.hoTen}</div>
                      <div className="text-xs text-gray-500 font-medium truncate">{currentUser.nhom}</div>
                  </div>
              </div>
              <button onClick={onLogout} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors" title="Đăng xuất"><LogOut className="w-5 h-5"/></button>
          </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full p-2 md:p-4 space-y-3 md:space-y-4">
          
          {/* Top Info & Filters */}
          {(step === 'p1' || step === 'p2') && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 md:p-4 space-y-3 md:space-y-4">
                 
                 {/* Progress Bar Top - Specifically for P2 to match Screenshot */}
                 {step === 'p2' && (
                     <div className="mb-2">
                         <div className="flex justify-between text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">
                             <span>Tiến độ bầu chọn</span>
                             <span>{votesP2.length}/{db.config.maxExcellentVotes} ({Math.round(votesP2.length/db.config.maxExcellentVotes*100)}%)</span>
                         </div>
                         <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                             <div className="h-full bg-yellow-400 transition-all duration-300" style={{ width: `${(votesP2.length / db.config.maxExcellentVotes) * 100}%` }}></div>
                         </div>
                     </div>
                 )}

                 {/* Title */}
                 <div>
                    <h2 className="text-base md:text-xl font-bold text-[#BE1E2D] flex items-center gap-2 uppercase leading-tight">
                         <FileText className="w-5 h-5 md:w-6 md:h-6 shrink-0"/> 
                         {step === 'p1' ? "BÌNH BẦU MỨC ĐỘ HOÀN THÀNH NHIỆM VỤ" : "BÌNH BẦU HOÀN THÀNH XUẤT SẮC NHIỆM VỤ"}
                    </h2>
                    <p className="text-xs md:text-sm text-gray-500 mt-1">
                        {step === 'p1' ? "Đánh giá, xếp loại chất lượng đảng viên." : "Bình bầu đảng viên hoàn thành xuất sắc nhiệm vụ."}
                    </p>
                 </div>

                 {/* Search & Action Row */}
                 <div className="flex flex-row gap-2 md:gap-3">
                     {/* Search */}
                     <div className="relative flex-1">
                         <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                         <input className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#BE1E2D] focus:border-transparent outline-none text-sm" placeholder="Tìm tên, MSSV..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                     </div>
                     
                     {/* P2 Specific Buttons */}
                     {step === 'p2' && (
                         <div className="flex gap-2 shrink-0">
                             {/* Only show count on mobile to save space */}
                            <button className="px-3 md:px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold border border-gray-200 flex items-center gap-2" disabled>
                                <Check className="w-4 h-4"/> <span className="hidden md:inline">Đã chọn</span> ({votesP2.length})
                            </button>
                             {votesP2.length > 0 && (
                                <button 
                                    onClick={() => setHideSelectedP2(!hideSelectedP2)} 
                                    className={`px-3 md:px-4 py-2 rounded-lg text-sm font-bold border flex items-center gap-2 transition-colors ${hideSelectedP2 ? 'bg-[#BE1E2D] text-white border-[#BE1E2D]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                >
                                    {hideSelectedP2 ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>} 
                                    <span className="hidden md:inline">{hideSelectedP2 ? "Hiện đã chọn" : "Ẩn đã chọn"}</span>
                                </button>
                             )}
                         </div>
                     )}

                     {/* P1 Toggle Hide */}
                     {step === 'p1' && (
                         <button 
                            onClick={() => setHideVotedP1(!hideVotedP1)}
                            className={`p-2 w-10 h-10 flex items-center justify-center rounded-lg border transition-colors shrink-0 ${hideVotedP1 ? 'bg-[#BE1E2D] text-white border-[#BE1E2D]' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                            title={hideVotedP1 ? "Hiện tất cả" : "Ẩn người đã vote"}
                         >
                            {hideVotedP1 ? <EyeOff className="w-5 h-5"/> : <Eye className="w-5 h-5"/>}
                         </button>
                     )}
                 </div>

                 {/* Filters Group */}
                 <div className="flex flex-col gap-3 pt-1">
                     {/* Horizontal Filters (Chips) - Now for both P1 and P2 */}
                     <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                            <Filter className="w-3.5 h-3.5 text-gray-500"/>
                        </div>
                        <button onClick={() => setFilterKhoa('all')} className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${filterKhoa === 'all' ? 'bg-[#BE1E2D] text-white border-[#BE1E2D]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>Tất cả Khóa</button>
                        {uniqueKhoa.map(k => (
                            <button key={k} onClick={() => setFilterKhoa(k)} className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${filterKhoa === k ? 'bg-[#BE1E2D] text-white border-[#BE1E2D]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{k}</button>
                        ))}
                     </div>
                     
                     {/* Nhom Filter (New) */}
                     <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                        <div className="w-7 h-7 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                            <Users className="w-3.5 h-3.5 text-orange-600"/>
                        </div>
                        <button onClick={() => setFilterNhom('all')} className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${filterNhom === 'all' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>Tất cả Nhóm</button>
                        {uniqueNhom.map(n => (
                            <button key={n} onClick={() => setFilterNhom(n)} className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${filterNhom === n ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{n}</button>
                        ))}
                     </div>
                     
                     {/* P1 Specific Filter: De Xuat */}
                     {step === 'p1' && (
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                            <div className="w-7 h-7 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
                                <ThumbsUp className="w-3.5 h-3.5 text-purple-600"/>
                            </div>
                            <button onClick={() => setFilterDeXuat('all')} className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${filterDeXuat === 'all' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>Tất cả đề xuất</button>
                            {uniqueDeXuat.map(d => (
                                <button key={d} onClick={() => setFilterDeXuat(d)} className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${filterDeXuat === d ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{d}</button>
                            ))}
                        </div>
                     )}
                 </div>

                 {/* Bulk Action P1 - Mobile Optimized */}
                 {step === 'p1' && db.config.allowBulkVoteP1 && visibleCandidatesP1.length > 0 && (
                     <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 flex flex-row items-center justify-between gap-3 animate-in slide-in-from-top-2">
                        <div className="text-xs md:text-sm text-indigo-900 font-bold flex items-center gap-2 leading-tight">
                            <Zap className="w-4 h-4 text-indigo-600 shrink-0"/>
                            <span>Bầu nhanh theo đề xuất của Chi bộ?</span>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <button onClick={handleVoteByProposal} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded hover:bg-indigo-700 shadow-sm whitespace-nowrap">Đồng ý</button>
                        </div>
                     </div>
                 )}
            </div>
          )}

          {/* Phase 1 List */}
          {step === 'p1' && (
             <div className="space-y-3 md:space-y-4">
                 {visibleCandidatesP1.map(candidate => (
                     <div key={candidate.cccd} className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${votesP1[candidate.cccd] ? 'border-green-200 bg-green-50/10' : 'border-gray-200 hover:shadow-md'}`}>
                         <div className="p-3 md:p-4 flex flex-col gap-2 md:gap-3">
                             {/* Hàng 1: Họ tên, Lớp (Trái) | Điểm số (Phải) */}
                             <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                <div className="flex flex-col w-full">
                                    <h3 className="font-black text-gray-800 text-lg md:text-2xl leading-tight mb-1 group-hover:text-[#BE1E2D] transition-colors">
                                        {candidate.hoTen}
                                    </h3>
                                    {db.config.p1Display.showMSSV && (
                                        <div className="inline-flex items-center gap-1 text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded w-fit mb-2">
                                            {candidate.mssv}
                                        </div>
                                    )}
                                    
                                    {/* Info Badges with Icons */}
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 md:gap-x-3 md:gap-y-1.5 mt-1 text-xs text-gray-600">
                                        {db.config.p1Display.showLop && candidate.lop && (
                                            <div className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-gray-700 font-medium">
                                                <GraduationCap className="w-3.5 h-3.5 text-gray-500" /> {candidate.lop}
                                            </div>
                                        )}
                                        {db.config.p1Display.showKhoa && candidate.khoa && (
                                            <div className="flex items-center gap-1">
                                                <School className="w-3.5 h-3.5 text-gray-400" /> {candidate.khoa}
                                            </div>
                                        )}
                                        {db.config.p1Display.showNhom && candidate.nhom && (
                                            <div className="flex items-center gap-1">
                                                <Users className="w-3.5 h-3.5 text-gray-400" /> {candidate.nhom}
                                            </div>
                                        )}
                                        {db.config.p1Display.showChucVu && candidate.chucVu && (
                                            <div className="flex items-center gap-1 text-gray-500 italic">
                                                <Briefcase className="w-3.5 h-3.5 text-gray-400" /> {candidate.chucVu}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Scores - Explicit Text */}
                                {(db.config.p1Display.showDiemHT || db.config.p1Display.showDiemRL) && (
                                    <div className="flex gap-2 shrink-0 mt-1 sm:mt-0 self-start">
                                        {db.config.p1Display.showDiemHT && (
                                            <div className="flex items-center gap-1 bg-blue-50 border border-blue-100 px-2 py-1 rounded text-blue-800">
                                                <BookOpen className="w-3 h-3 md:w-3.5 md:h-3.5 text-blue-500"/>
                                                <span className="text-[10px] font-bold uppercase text-blue-400">Học tập:</span>
                                                <span className="text-xs md:text-sm font-bold">{candidate.diemHT}</span>
                                            </div>
                                        )}
                                        {db.config.p1Display.showDiemRL && (
                                            <div className="flex items-center gap-1 bg-orange-50 border border-orange-100 px-2 py-1 rounded text-orange-800">
                                                <Activity className="w-3 h-3 md:w-3.5 md:h-3.5 text-orange-500"/>
                                                <span className="text-[10px] font-bold uppercase text-orange-400">Rèn luyện:</span>
                                                <span className="text-xs md:text-sm font-bold">{candidate.diemRL}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                             </div>

                             {/* Hàng 3: Thành tích (Có tính năng Xem thêm/Thu gọn) */}
                             {db.config.p1Display.showThanhTich && candidate.thanhTich && (
                                 <div className="bg-[#FFF9C4]/40 border border-[#FFF9C4] rounded px-3 py-2 flex gap-2 items-start mt-1">
                                     <Award className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5"/>
                                     <div className="flex-1 min-w-0">
                                         <p className={`text-xs text-yellow-900 leading-relaxed ${expandedText[candidate.cccd] ? '' : 'line-clamp-2'}`}>
                                             {candidate.thanhTich}
                                         </p>
                                         {candidate.thanhTich.length > 120 && (
                                             <button 
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setExpandedText(prev => ({...prev, [candidate.cccd]: !prev[candidate.cccd]}));
                                                }}
                                                className="text-[10px] font-bold text-yellow-700 hover:text-yellow-900 mt-0.5 underline decoration-dotted transition-colors"
                                             >
                                                 {expandedText[candidate.cccd] ? "Thu gọn" : "Xem thêm"}
                                             </button>
                                         )}
                                     </div>
                                 </div>
                             )}

                             {/* Hàng 4: Tự đánh giá & Đề xuất (Combined Row) */}
                             {(db.config.p1Display.showTuDanhGia || db.config.p1Display.showMucDeXuat) && (
                                 <div className="flex flex-col sm:flex-row gap-0 sm:gap-0 border border-indigo-100 rounded-lg overflow-hidden mt-1 text-sm">
                                     {db.config.p1Display.showTuDanhGia && candidate.tuDanhGia && (
                                         <div className="flex-1 bg-indigo-50/50 px-3 py-2 flex items-center gap-2 border-b sm:border-b-0 sm:border-r border-indigo-100">
                                             <User className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                             <span className="text-xs font-bold text-indigo-400 uppercase shrink-0">Tự đánh giá:</span>
                                             <span className="font-medium text-indigo-900">{candidate.tuDanhGia}</span>
                                         </div>
                                     )}
                                     {db.config.p1Display.showMucDeXuat && candidate.mucDeXuat && (
                                         <div className="flex-1 bg-purple-50/50 px-3 py-2 flex items-center gap-2">
                                             <Zap className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                                             <span className="text-xs font-bold text-purple-500 uppercase shrink-0">Đề xuất:</span>
                                             <span className="font-bold text-purple-900">{candidate.mucDeXuat}</span>
                                         </div>
                                     )}
                                 </div>
                             )}

                             {/* Voting Buttons - Taller on mobile */}
                             <div className="grid grid-cols-3 gap-2 mt-2">
                                 {[VoteLevel1.KHONG_HOAN_THANH, VoteLevel1.HOAN_THANH, VoteLevel1.HOAN_THANH_TOT].map(level => {
                                      const isSelected = votesP1[candidate.cccd] === level;
                                      let btnClass = "bg-white border-gray-200 text-gray-500 hover:bg-gray-50";
                                      if (isSelected) {
                                          if (level === VoteLevel1.KHONG_HOAN_THANH) btnClass = "bg-red-50 border-red-500 text-red-700 ring-1 ring-red-500 font-bold";
                                          if (level === VoteLevel1.HOAN_THANH) btnClass = "bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500 font-bold";
                                          if (level === VoteLevel1.HOAN_THANH_TOT) btnClass = "bg-green-50 border-green-500 text-green-700 ring-1 ring-green-500 font-bold";
                                      }
                                      return (
                                          <button 
                                            key={level} 
                                            onClick={() => handleVoteP1Change(candidate.cccd, level)}
                                            className={`py-3 md:py-2.5 px-1 rounded-lg border text-xs transition-all active:scale-95 touch-manipulation ${btnClass}`}
                                          >
                                              {level}
                                          </button>
                                      );
                                 })}
                             </div>
                         </div>
                     </div>
                 ))}
                 
                 {/* Empty State */}
                 {visibleCandidatesP1.length === 0 && (
                     <div className="text-center py-12">
                         <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-400">
                             {hideVotedP1 ? <CheckCircle className="w-8 h-8"/> : <Search className="w-8 h-8"/>}
                         </div>
                         <p className="text-gray-500 text-sm">
                             {hideVotedP1 ? "Bạn đã hoàn thành đánh giá tất cả ứng viên hiển thị." : "Không tìm thấy ứng viên nào phù hợp."}
                         </p>
                     </div>
                 )}
                 
                 {/* Fixed Bottom Action Bar */}
                 <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                     {/* Progress Bar */}
                     <div className="w-full h-1 bg-gray-100">
                         <div 
                            className="h-full bg-green-500 transition-all duration-300" 
                            style={{ width: `${(Object.keys(votesP1).length / db.candidatesP1.length) * 100}%` }}
                         ></div>
                     </div>
                     
                     <div className="p-3 md:p-4 max-w-4xl mx-auto flex items-center justify-between gap-4">
                        <div className="text-xs font-medium text-gray-600">
                            Đã đánh giá: <b className="text-[#BE1E2D] text-base">{Object.keys(votesP1).length}</b> <span className="text-gray-400">/ {db.candidatesP1.length}</span>
                        </div>
                        <Button 
                            onClick={() => setConfirmModal({isOpen: true, title: "Xác nhận gửi phiếu", message: "Bạn có chắc chắn muốn gửi kết quả đánh giá không?", onConfirm: () => { setConfirmModal(prev=>({...prev, isOpen: false})); submitP1(); }})} 
                            className="shadow-lg min-w-[120px] md:min-w-[140px] text-sm py-2.5" 
                            disabled={loading}
                        >
                             {loading ? <Loader2 className="animate-spin w-5 h-5"/> : "Nộp kết quả"}
                        </Button>
                     </div>
                 </div>
             </div>
          )}

          {/* Phase 2 List */}
          {step === 'p2' && (
             <div className="space-y-4">
                 
                 {/* Yellow Banner - Matches Screenshot */}
                 <div className="bg-[#E6A800] rounded-xl p-4 shadow-sm text-white flex items-center justify-between relative overflow-hidden">
                     <div className="relative z-10">
                         <div className="text-xs font-bold text-yellow-900 uppercase tracking-wide opacity-70 mb-1">Số lượng bình bầu tối đa</div>
                         <div className="text-3xl font-black text-yellow-900">
                            {db.config.maxExcellentVotes} <span className="text-lg opacity-60">đồng chí</span>
                         </div>
                     </div>
                     <div className="bg-white/20 p-3 rounded-full relative z-10">
                         <Star className="w-8 h-8 text-yellow-900"/>
                     </div>
                     <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-10 -mt-10"></div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                    {visibleCandidatesP2.map(candidate => {
                        const isSelected = votesP2.includes(candidate.cccd);
                        return (
                            <div key={candidate.cccd} onClick={() => toggleVoteP2(candidate.cccd)} className={`cursor-pointer relative bg-white rounded-xl border-2 transition-all group pt-6 ${isSelected ? 'border-yellow-400 shadow-md ring-2 ring-yellow-100' : 'border-gray-100 hover:border-yellow-200'}`}>
                                
                                {/* Badge Proposal - Red Pill Top Left */}
                                {db.config.p2Display.showChiBoDeXuat && candidate.chiBoDeXuat && (
                                    <div className="absolute -top-3 left-4 bg-[#BE1E2D] text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-sm flex items-center gap-1 z-10">
                                        <ThumbsUp className="w-3 h-3" /> <span className="hidden sm:inline">Đề xuất:</span> {candidate.chiBoDeXuat}
                                    </div>
                                )}
                                
                                {/* Selected Checkmark */}
                                {isSelected && (
                                    <div className="absolute top-2 right-2 bg-yellow-400 text-white w-6 h-6 rounded-full flex items-center justify-center shadow-sm z-10">
                                        <Check className="w-4 h-4"/>
                                    </div>
                                )}
                                {!isSelected && (
                                     <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center z-10">
                                        <div className="w-4 h-4 rounded-full border border-gray-300"></div>
                                    </div>
                                )}

                                <div className="p-3 md:p-4 pt-3">
                                     {/* Row 1: Name + MSSV */}
                                     <div className="mb-1">
                                         <h3 className={`font-black text-lg md:text-xl leading-tight ${isSelected ? 'text-yellow-900' : 'text-gray-800 group-hover:text-[#BE1E2D] transition-colors'}`}>
                                             {candidate.hoTen}
                                         </h3>
                                         {db.config.p2Display.showMSSV && <div className="text-xs text-gray-400 font-medium font-mono mt-0.5">{candidate.mssv}</div>}
                                     </div>

                                     {/* Row 2: Metadata (Chuc Vu, Lop, Khoa, Nhom) */}
                                     <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 text-xs text-gray-600">
                                         {db.config.p2Display.showChucVu && candidate.chucVu && (
                                             <div className="flex items-center gap-1 font-semibold text-gray-700">
                                                 <Briefcase className="w-3.5 h-3.5 text-gray-400"/> {candidate.chucVu}
                                             </div>
                                         )}
                                         {db.config.p2Display.showLop && candidate.lop && (
                                             <div className="flex items-center gap-1">
                                                 <GraduationCap className="w-3.5 h-3.5 text-gray-400"/> {candidate.lop}
                                             </div>
                                         )}
                                         {db.config.p2Display.showKhoa && candidate.khoa && (
                                             <div className="flex items-center gap-1">
                                                 <School className="w-3.5 h-3.5 text-gray-400"/> {candidate.khoa}
                                             </div>
                                         )}
                                         {db.config.p2Display.showNhom && candidate.nhom && (
                                             <div className="flex items-center gap-1">
                                                 <Users className="w-3.5 h-3.5 text-gray-400"/> {candidate.nhom}
                                             </div>
                                         )}
                                     </div>

                                     {/* Row 3: Thanh Tich (New P2 Feature) */}
                                     {db.config.p2Display.showThanhTich && candidate.thanhTich && (
                                         <div className="bg-[#FFF9C4]/40 border border-[#FFF9C4] rounded px-3 py-2 flex gap-2 items-start mb-2 mt-1">
                                             <Award className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5"/>
                                             <div className="flex-1 min-w-0">
                                                 <p className={`text-xs text-yellow-900 leading-relaxed ${expandedText[candidate.cccd] ? '' : 'line-clamp-2'}`}>
                                                     {candidate.thanhTich}
                                                 </p>
                                                 {candidate.thanhTich.length > 80 && (
                                                     <button 
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setExpandedText(prev => ({...prev, [candidate.cccd]: !prev[candidate.cccd]}));
                                                        }}
                                                        className="text-[10px] font-bold text-yellow-700 hover:text-yellow-900 mt-0.5 underline decoration-dotted transition-colors"
                                                     >
                                                         {expandedText[candidate.cccd] ? "Thu gọn" : "Xem thêm"}
                                                     </button>
                                                 )}
                                             </div>
                                         </div>
                                     )}

                                     {/* Row 4: Scores & Self Assessment - Explicit Labels */}
                                     <div className="mt-2 pt-2 border-t border-gray-100 flex flex-col gap-2">
                                         <div className="flex flex-wrap items-center gap-2">
                                             {db.config.p2Display.showDiemHT && (
                                                 <div className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1.5 rounded text-xs font-bold border border-blue-100 whitespace-nowrap">
                                                     <BookOpen className="w-3 h-3"/> Học tập: {candidate.diemHT}
                                                 </div>
                                             )}
                                             {db.config.p2Display.showDiemRL && (
                                                 <div className="flex items-center gap-1 bg-orange-50 text-orange-700 px-2 py-1.5 rounded text-xs font-bold border border-orange-100 whitespace-nowrap">
                                                     <Activity className="w-3 h-3"/> Rèn luyện: {candidate.diemRL}
                                                 </div>
                                             )}
                                         </div>
                                         
                                         {/* Self Assessment */}
                                         {db.config.p2Display.showTuDanhGia && candidate.tuDanhGia && (
                                            <div className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-800 px-2 py-1.5 rounded border border-indigo-100 w-fit">
                                                <User className="w-3 h-3 text-indigo-500"/> 
                                                Tự đánh giá: <span className="font-bold">{candidate.tuDanhGia}</span>
                                            </div>
                                         )}
                                     </div>
                                </div>
                            </div>
                        )
                    })}
                 </div>

                 {/* Fixed Bottom P2 */}
                 <div className={`fixed bottom-0 left-0 w-full z-50 p-3 md:p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] transition-colors ${votesP2.length > 0 ? 'bg-yellow-100 border-t border-yellow-300' : 'bg-white border-t border-gray-200'}`}>
                     <div className="max-w-4xl mx-auto flex items-center justify-between">
                         <div className={`text-sm font-bold ${votesP2.length > 0 ? 'text-yellow-800' : 'text-gray-500'}`}>
                             {votesP2.length === 0 ? "Vui lòng chọn ít nhất 1 người" : <span>Đã chọn <span className="text-lg">{votesP2.length}</span> đồng chí</span>}
                         </div>
                         
                         <div className="flex gap-2">
                             {votesP2.length > 0 && (
                                <button onClick={() => setVotesP2([])} className="px-3 md:px-4 py-2 bg-white text-gray-600 rounded-lg text-sm font-bold border border-gray-300 hover:bg-gray-50">
                                    Xóa <span className="hidden md:inline">chọn</span>
                                </button>
                             )}
                             <Button 
                                onClick={() => {
                                    const selectedList = db.candidatesP2.filter(c => votesP2.includes(c.cccd));
                                    setConfirmModal({
                                        isOpen: true, 
                                        title: "Xác nhận phiếu bầu",
                                        className: "max-w-4xl", // Make modal wide
                                        message: (
                                            <div className="space-y-3">
                                                <div className="text-gray-600">Bạn đã chọn <b className="text-yellow-600 text-lg">{votesP2.length}</b> đồng chí:</div>
                                                <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2">
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                                        {selectedList.map((c, idx) => (
                                                            <div key={c.cccd} className="flex items-start gap-2 bg-white p-2 rounded border border-gray-100 shadow-sm text-sm">
                                                                <span className="shrink-0 w-5 h-5 rounded-full bg-yellow-100 text-yellow-700 font-bold text-[10px] flex items-center justify-center mt-0.5">
                                                                    {idx + 1}
                                                                </span>
                                                                <div className="min-w-0">
                                                                    <div className="font-bold text-gray-800">{c.hoTen}</div>
                                                                    <div className="text-[10px] text-gray-500 truncate">{c.lop ? `${c.lop}` : c.khoa}</div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="text-xs text-red-500 italic mt-2">* Vui lòng kiểm tra kỹ trước khi nhấn Đồng ý. Hành động này không thể hoàn tác.</div>
                                            </div>
                                        ), 
                                        onConfirm: () => { 
                                            setConfirmModal(prev=>({...prev, isOpen: false})); 
                                            submitP2(); 
                                        }
                                    });
                                }} 
                                className={`min-w-[120px] md:min-w-[140px] shadow-xl ${votesP2.length > db.config.maxExcellentVotes ? 'bg-gray-400 cursor-not-allowed' : 'bg-yellow-500 hover:bg-yellow-600 text-white'}`}
                                disabled={loading || votesP2.length > db.config.maxExcellentVotes || votesP2.length === 0}
                            >
                                 {loading ? <Loader2 className="animate-spin w-5 h-5"/> : "Gửi Phiếu Bầu"}
                             </Button>
                         </div>
                     </div>
                 </div>
             </div>
          )}

          {/* Completed / Closed View */}
          {(step === 'completed' || step === 'closed') && (
              <div className="flex flex-col items-center justify-center py-12 text-center animate-in fade-in zoom-in duration-500">
                  <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6 text-green-600">
                      <CheckCircle className="w-12 h-12"/>
                  </div>
                  <h2 className="text-2xl font-black text-gray-800 mb-2">Hoàn Tất</h2>
                  <p className="text-gray-600 max-w-md mx-auto">
                      {step === 'closed' ? "Hệ thống hiện đang đóng hoặc bạn không có phiên bầu cử nào cần thực hiện." : "Cảm ơn đồng chí đã hoàn thành nghĩa vụ bầu cử. Chúc đồng chí sức khỏe và thành công!"}
                  </p>
                  
                  {/* Results or Review could go here if configured */}
                  {db.config.allowReview && (
                      <button 
                        onClick={handleShowReview} 
                        className="mt-6 px-6 py-2 bg-blue-50 text-blue-600 font-bold rounded-full hover:bg-blue-100 transition-colors flex items-center gap-2"
                        disabled={loading}
                      >
                         {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Eye className="w-4 h-4"/>} Xem lại kết quả của tôi
                      </button>
                  )}

                  <Button onClick={onLogout} className="mt-8" variant="outline">Đăng xuất</Button>
              </div>
          )}
      </main>
    </div>
  );
};