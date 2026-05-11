"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { database } from "@/lib/firebase";
import { ref, onValue, set, get } from "firebase/database";

export default function Room() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const searchParams = useSearchParams();
  const isAdmin = searchParams.get('admin') === 'true';

  const [setlist, setSetlist] = useState<any[]>([]);
  const [roomTitle, setRoomTitle] = useState("Loading...");
  
  const [bpm, setBpm] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [showShareModal, setShowShareModal] = useState(false);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextNoteTimeRef = useRef(0);
  const timerIDRef = useRef<number | null>(null);
  const currentSongRef = useRef<HTMLDivElement>(null);
  
  // New refs for high precision sync
  const startTimeRef = useRef<number | null>(null);
  const beatCountRef = useRef(0);
  const scheduledBeatsRef = useRef<Set<number>>(new Set());

  // Refs to avoid stale closures in RAF loop and event handlers
  const bpmRef = useRef(bpm);
  const isMutedRef = useRef(isMuted);
  const isPlayingRef = useRef(isPlaying);
  const serverTimeOffsetRef = useRef(0);
  bpmRef.current = bpm;
  isMutedRef.current = isMuted;
  isPlayingRef.current = isPlaying;

  // NTP Server Time Offset
  const [serverTimeOffset, setServerTimeOffset] = useState(0);

  useEffect(() => {
    // 오프셋 감지
    const offsetRef = ref(database, ".info/serverTimeOffset");
    onValue(offsetRef, (snap) => {
      const offset = snap.val() || 0;
      setServerTimeOffset(offset);
      serverTimeOffsetRef.current = offset;
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    const roomRef = ref(database, `rooms/${id}`);
    
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        // 데이터가 아직 도달하지 않았을 수 있으므로 약간의 지연 후 다시 확인
        setTimeout(() => {
          get(roomRef).then(snap => {
            if (!snap.exists()) {
              setRoomTitle("존재하지 않는 방입니다.");
              setSetlist([]);
            } else {
              setRoomTitle(snap.val().title);
              setSetlist(snap.val().setlist || []);
            }
          }).catch(err => {
            alert("Firebase 데이터베이스 접근 권한 오류가 발생했습니다. 규칙(Rules) 설정을 확인해주세요.\n\n" + err.message);
          });
        }, 2000);
        return;
      }
      
      setRoomTitle(data.title);
      setSetlist(data.setlist || []);
      
      if (data.state) {
        // 관리자가 아닐 때만 서버 상태를 강제로 동기화 
        // (관리자는 자신이 수정한 상태가 즉각 반영되도록 로컬 상태 우선 업데이트 후 서버로 쏘기 때문에)
        // 하지만 완벽한 동기화를 위해 관리자도 서버 값을 신뢰하게 할 수 있음
        setIsPlaying(data.state.isPlaying);
        setBpm(data.state.bpm);
        setCurrentSongIndex(data.state.currentSongIndex);
        
        // startTime은 AudioContext 유무와 관계없이 항상 저장 (overlay 탭 시 sync에 필요)
        if (data.state.startTime) {
          startTimeRef.current = data.state.startTime;
        }

        // 재생 중일 경우 스케줄링을 위한 동기화 타임스탬프 계산
        if (data.state.isPlaying && data.state.startTime && audioCtxRef.current) {
          if (!timerIDRef.current) {
            const nowServer = Date.now() + serverTimeOffset;
            const beatDurationMs = 60000 / data.state.bpm;
            
            // 시작점(startTime)으로부터 현재까지 몇 박자가 지났는지 정밀 계산
            const timeElapsedMs = nowServer - data.state.startTime;
            
            // 만약 시작 시간이 미래라면 (targetStartTime), beatsPassed는 0
            const beatsPassed = Math.max(0, Math.ceil(timeElapsedMs / beatDurationMs));
            beatCountRef.current = beatsPassed;
            
            // 다음 비트가 터져야 할 서버 시간
            const nextBeatServerTime = data.state.startTime + (beatsPassed * beatDurationMs);
            
            // 서버 시간을 로컬 오디오 컨텍스트 시간으로 변환
            const msUntilNextBeat = nextBeatServerTime - nowServer;
            nextNoteTimeRef.current = audioCtxRef.current.currentTime + (msUntilNextBeat / 1000);
            
            scheduler();
          }
        } else if (!data.state.isPlaying && timerIDRef.current) {
          // 서버에서 정지 신호를 받았을 때 스케줄러 중단
          cancelAnimationFrame(timerIDRef.current);
          timerIDRef.current = null;
        }
      }
    }, (error) => {
      console.error("Firebase DB Error:", error);
      alert("데이터 동기화 오류: " + error.message + "\nFirebase 데이터베이스 규칙이나 URL이 올바른지 확인해주세요.");
    });

    return () => unsubscribe();
  }, [params.id, router, serverTimeOffset]);

  // 서버에 상태 업데이트 (관리자 전용)
  const updateState = async (newState: Partial<{ isPlaying: boolean, bpm: number, currentSongIndex: number, startTime: any }>) => {
    if (!isAdmin || !id) return;
    const stateRef = ref(database, `rooms/${id}/state`);
    
    // 기존 상태를 유지하면서 덮어쓰기 위해 현재 상태 먼저 읽기
    const snapshot = await get(stateRef);
    const currentState = snapshot.val() || {};
    
    await set(stateRef, { ...currentState, ...newState });
  };

  const handleBpmChange = (delta: number) => {
    if (!isAdmin) return;
    const newBpm = Math.min(240, Math.max(40, bpm + delta));
    setBpm(newBpm);
    updateState({ bpm: newBpm });
  };

  const handleTap = () => {
    if (!isAdmin) return;
    const now = Date.now();
    
    if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > 2000) {
      setTapTimes([now]);
      return;
    }
    
    const newTapTimes = [...tapTimes, now].slice(-4);
    setTapTimes(newTapTimes);
    
    if (newTapTimes.length >= 2) {
      let totalDiff = 0;
      for (let i = 1; i < newTapTimes.length; i++) {
        totalDiff += (newTapTimes[i] - newTapTimes[i-1]);
      }
      const avgDiff = totalDiff / (newTapTimes.length - 1);
      const calculatedBpm = Math.round(60000 / avgDiff);
      const finalBpm = Math.min(240, Math.max(40, calculatedBpm));
      setBpm(finalBpm);
      updateState({ bpm: finalBpm });
    }
  };

  const changeSong = (direction: 1 | -1) => {
    if (!isAdmin) return;
    const newIndex = currentSongIndex + direction;
    if (newIndex >= 0 && newIndex < setlist.length) {
      setCurrentSongIndex(newIndex);
      const newBpm = setlist[newIndex].bpm;
      setBpm(newBpm);
      updateState({ currentSongIndex: newIndex, bpm: newBpm });
    }
  };

  const togglePlay = async () => {
    if (!isAdmin) return;
    
    if (!isPlaying) {
      // 재생 시작 시 현재 서버 시간을 기준으로 100ms 뒤를 시작점으로 예약
      const targetStartTime = Date.now() + serverTimeOffset + 100;
      startTimeRef.current = targetStartTime;
      beatCountRef.current = 0;
      scheduledBeatsRef.current.clear();
      
      setIsPlaying(true);
      await updateState({ 
        isPlaying: true, 
        startTime: targetStartTime 
      });
      
      // 로컬 오디오 컨텍스트 킥스타트
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      
      // 시작 서버 시간을 로컬 오디오 시간으로 변환
      const nowServer = Date.now() + serverTimeOffset;
      const msUntilStart = targetStartTime - nowServer;
      nextNoteTimeRef.current = audioCtxRef.current.currentTime + (msUntilStart / 1000);
      
      scheduler();
    } else {
      // 정지
      setIsPlaying(false);
      await updateState({ isPlaying: false, startTime: 0 });
      if (timerIDRef.current) {
        cancelAnimationFrame(timerIDRef.current);
        timerIDRef.current = null;
      }
    }
  };

  const playClick = (time: number) => {
    if (!audioCtxRef.current) return;
    
    if (!isMutedRef.current) {
      const osc = audioCtxRef.current.createOscillator();
      const gain = audioCtxRef.current.createGain();
      
      osc.connect(gain);
      gain.connect(audioCtxRef.current.destination);
      
      osc.frequency.value = 800;
      gain.gain.setValueAtTime(1, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
      
      osc.start(time);
      osc.stop(time + 0.1);
    }

    // 비주얼 펄스 동기화 (오디오 시간 기준)
    const delay = (time - audioCtxRef.current.currentTime) * 1000;
    if (delay <= 0) {
      setPulse(true);
      setTimeout(() => setPulse(false), 50);
    } else {
      setTimeout(() => {
        setPulse(true);
        setTimeout(() => setPulse(false), 50);
      }, delay);
    }
  };

  const scheduler = () => {
    if (!audioCtxRef.current) return;
    
    // 200ms 룩어헤드로 더 안정적인 스케줄링
    while (nextNoteTimeRef.current < audioCtxRef.current.currentTime + 0.2) {
      playClick(nextNoteTimeRef.current);
      
      // 다음 비트 시간 계산
      const beatDuration = 60.0 / bpmRef.current;
      nextNoteTimeRef.current += beatDuration;
    }
    timerIDRef.current = requestAnimationFrame(scheduler);
  };


  // 첫 사용자 인터랙션 시 오디오 컨텍스트 활성화 (크롬 정책)
  useEffect(() => {
    const initAudio = () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().then(() => {
          if (!isAdmin && isPlayingRef.current && !timerIDRef.current && startTimeRef.current) {
            const nowServer = Date.now() + serverTimeOffsetRef.current;
            const beatDurationMs = 60000 / bpmRef.current;
            const beatsPassed = Math.max(0, Math.ceil((nowServer - startTimeRef.current) / beatDurationMs));
            const msUntilNextBeat = (startTimeRef.current + beatsPassed * beatDurationMs) - nowServer;
            nextNoteTimeRef.current = audioCtxRef.current!.currentTime + Math.max(0, msUntilNextBeat / 1000);
            scheduler();
          }
        });
      }
    };
    
    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('touchstart', initAudio, { once: true });
    return () => {
      document.removeEventListener('click', initAudio);
      document.removeEventListener('touchstart', initAudio);
    }
  }, []);

  useEffect(() => {
    if (currentSongRef.current) {
      currentSongRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentSongIndex]);

  const currentSong = setlist[currentSongIndex];
  const nextSong = currentSongIndex + 1 < setlist.length ? setlist[currentSongIndex + 1] : null;

  const currentUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const viewerLink = `${currentUrl}/room/${id}`;
  const adminLink = `${currentUrl}/room/${id}?admin=true`;

  if (roomTitle === "존재하지 않는 방입니다.") {
    const dbUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "설정되지 않음";
    return (
      <main className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: '1rem', color: '#ff3366' }}>방을 찾을 수 없습니다</h2>
          <p style={{ color: '#999', marginBottom: '1rem' }}>Firebase 데이터베이스 연결 문제이거나 삭제된 방입니다.</p>
          <div style={{ background: '#222', padding: '0.5rem', borderRadius: '4px', fontSize: '0.75rem', color: '#666', marginBottom: '2rem' }}>
            연결 시도 주소: {dbUrl}<br/>
            찾으려는 방 ID: {id || "알 수 없음"}
          </div>
          <Link href="/">
            <button className="play-btn" style={{ padding: '1rem 2rem' }}>메인으로 돌아가기</button>
          </Link>
        </div>
      </main>
    );
  }

  if (setlist.length === 0) {
    return <main className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}><div>데이터 동기화 중... (잠시만 기다려주세요)</div></main>;
  }

  return (
    <>
      <div className={`pulse-bg ${pulse ? 'pulse-active' : ''}`}></div>
      <main className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <header className="header">
          <Link href="/" style={{ color: 'var(--text-color)', textDecoration: 'none' }}>
            <div className="brand">TEMPO</div>
          </Link>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div className="status" style={{ color: isAdmin ? 'var(--accent-color)' : '#999' }}>
              {isAdmin ? 'MASTER' : 'VIEWER'} • {roomTitle}
            </div>
            {isAdmin && (
              <button 
                onClick={() => setShowShareModal(true)}
                style={{ background: 'var(--text-color)', color: 'var(--bg-color)', border: 'none', padding: '0.25rem 1rem', borderRadius: '50px', fontWeight: 900, cursor: 'pointer' }}
              >
                SHARE
              </button>
            )}
          </div>
        </header>

        <section className="main-display">
          <div className="bpm-label">BPM</div>
          
          <div className="bpm-section">
            <button className="bpm-adjust-btn" onClick={() => handleBpmChange(-10)} style={{ opacity: isAdmin ? 1 : 0.2, pointerEvents: isAdmin ? 'auto' : 'none' }}>-10</button>
            <button className="bpm-adjust-btn" onClick={() => handleBpmChange(-1)} style={{ opacity: isAdmin ? 1 : 0.2, pointerEvents: isAdmin ? 'auto' : 'none' }}>-1</button>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              <div 
                className="bpm-display" 
                onClick={handleTap}
                style={{ pointerEvents: isAdmin ? 'auto' : 'none' }}
              >
                {bpm}
              </div>
              <div style={{ 
                fontSize: '0.75rem', 
                color: 'var(--accent-color)', 
                fontWeight: 900, 
                letterSpacing: '3px', 
                opacity: isAdmin ? 0.7 : 0,
                marginTop: '0.5rem',
                pointerEvents: 'none'
              }}>
                TAP THE NUMBER
              </div>
            </div>
            <button className="bpm-adjust-btn" onClick={() => handleBpmChange(1)} style={{ opacity: isAdmin ? 1 : 0.2, pointerEvents: isAdmin ? 'auto' : 'none' }}>+1</button>
            <button className="bpm-adjust-btn" onClick={() => handleBpmChange(10)} style={{ opacity: isAdmin ? 1 : 0.2, pointerEvents: isAdmin ? 'auto' : 'none' }}>+10</button>
          </div>
          
          <div className="controls">
            <div className="main-controls">
              <button 
                className={`play-btn ${isPlaying ? 'playing' : ''}`}
                onClick={togglePlay}
                style={{ opacity: isAdmin ? 1 : 0.5, pointerEvents: isAdmin ? 'auto' : 'none' }}
              >
                {isPlaying ? 'STOP' : 'PLAY'}
              </button>
              <button 
                className={`action-btn ${isMuted ? 'muted' : ''}`}
                onClick={() => setIsMuted(!isMuted)}
              >
                {isMuted ? 'UNMUTE' : 'MUTE'}
              </button>
            </div>
            {!isAdmin && isPlaying && (!audioCtxRef.current || audioCtxRef.current.state === 'suspended') && (
              <div 
                onClick={() => {
                  if (!audioCtxRef.current) {
                    audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                  }
                  audioCtxRef.current.resume().then(() => {
                    if (isPlayingRef.current && !timerIDRef.current && startTimeRef.current) {
                      const nowServer = Date.now() + serverTimeOffsetRef.current;
                      const beatDurationMs = 60000 / bpmRef.current;
                      const beatsPassed = Math.max(0, Math.ceil((nowServer - startTimeRef.current) / beatDurationMs));
                      const msUntilNextBeat = (startTimeRef.current + beatsPassed * beatDurationMs) - nowServer;
                      nextNoteTimeRef.current = audioCtxRef.current!.currentTime + Math.max(0, msUntilNextBeat / 1000);
                      scheduler();
                    }
                  });
                }}
                style={{ 
                  position: 'fixed', 
                  top: 0, left: 0, right: 0, bottom: 0, 
                  backgroundColor: 'rgba(224, 255, 0, 0.2)', 
                  zIndex: 200, 
                  display: 'flex', 
                  flexDirection: 'column',
                  alignItems: 'center', 
                  justifyContent: 'center',
                  cursor: 'pointer',
                  backdropFilter: 'blur(10px)',
                  textAlign: 'center',
                  padding: '2rem'
                }}
              >
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent-color)', textShadow: '0 0 20px rgba(0,0,0,0.5)', marginBottom: '1rem' }}>
                  TAP TO JOIN SESSION
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                  실시간 동기화를 위해 화면을 터치해 주세요
                </div>
                <div style={{ marginTop: '2rem', width: '60px', height: '60px', borderRadius: '50%', border: '4px solid var(--accent-color)', animation: 'pulse 1s infinite' }}></div>
              </div>
            )}
          </div>
        </section>

        <section className="setlist-container" style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', flexShrink: 1, overflow: 'hidden', maxHeight: '40%' }}>
          <div className="setlist-header" style={{ flexShrink: 0 }}>
            <span className="setlist-title">Setlist ({currentSongIndex + 1} / {setlist.length})</span>
            {isAdmin && (
              <div className="setlist-nav">
                <button 
                  className="nav-btn" 
                  onClick={() => changeSong(-1)}
                  disabled={currentSongIndex === 0}
                  style={{ opacity: currentSongIndex === 0 ? 0.3 : 1 }}
                >
                  &larr; PREV
                </button>
                <button 
                  className="nav-btn" 
                  onClick={() => changeSong(1)}
                  disabled={currentSongIndex === setlist.length - 1}
                  style={{ opacity: currentSongIndex === setlist.length - 1 ? 0.3 : 1 }}
                >
                  NEXT &rarr;
                </button>
              </div>
            )}
          </div>
          
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.5rem' }}>
            {setlist.map((song, index) => {
              const isCurrent = index === currentSongIndex;
              const isNext = index === currentSongIndex + 1;
              const isPast = index < currentSongIndex;
              
              let itemStyle = { opacity: 1, borderBottom: '1px solid #333' };
              if (isPast) itemStyle.opacity = 0.3;
              if (index === setlist.length - 1) itemStyle.borderBottom = 'none';

              return (
                <div 
                  key={song.id || index} 
                  className="song-item" 
                  style={itemStyle}
                  ref={isCurrent ? currentSongRef : null}
                >
                  <div className="song-info">
                    <span className="song-title" style={{ color: isCurrent ? 'var(--accent-color)' : 'inherit' }}>
                      {song.title} {isCurrent ? '(Playing)' : isNext ? '(Next)' : ''}
                    </span>
                    <span className="song-meta">{song.bpm} BPM • {song.timeSignature}</span>
                  </div>
                  {isCurrent && (
                    <div className="song-action" style={{ animation: isPlaying ? 'pulse 1s infinite alternate' : 'none' }}>
                      &bull;
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {showShareModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--surface-color)', padding: '2rem', borderRadius: '16px', maxWidth: '400px', width: '100%', border: '1px solid #333' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 900 }}>링크 공유하기</h2>
                <button onClick={() => setShowShareModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
              </div>
              
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: 'var(--accent-color)', fontWeight: 700, marginBottom: '0.5rem' }}>관리자 링크 (절대 공유 금지!)</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <div style={{ flex: 1, background: '#000', padding: '1rem', borderRadius: '8px', wordBreak: 'break-all', fontSize: '0.875rem', color: '#ccc' }}>
                    {adminLink}
                  </div>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(adminLink);
                      alert("관리자 링크가 복사되었습니다.");
                    }}
                    style={{ background: 'var(--accent-color)', color: '#000', border: 'none', borderRadius: '8px', padding: '0 1rem', fontWeight: 900, cursor: 'pointer' }}
                  >
                    COPY
                  </button>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>이 링크는 마스터 폰이나 카카오톡 '나에게 쓰기'에만 저장하세요.</p>
              </div>

              <div>
                <label style={{ display: 'block', color: '#fff', fontWeight: 700, marginBottom: '0.5rem' }}>세션 초대 링크</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <div style={{ flex: 1, background: '#000', padding: '1rem', borderRadius: '8px', wordBreak: 'break-all', fontSize: '0.875rem', color: '#ccc' }}>
                    {viewerLink}
                  </div>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(viewerLink);
                      alert("초대 링크가 복사되었습니다.");
                    }}
                    style={{ background: '#fff', color: '#000', border: 'none', borderRadius: '8px', padding: '0 1rem', fontWeight: 900, cursor: 'pointer' }}
                  >
                    COPY
                  </button>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>팀원들에게 공유하세요. 보기만 가능하며 템포 조작이 불가능합니다.</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
