"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { database } from "@/lib/firebase";
import { ref, push, set } from "firebase/database";

export default function CreateWorship() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [setlist, setSetlist] = useState([
    { id: 1, title: "", bpm: 120, timeSignature: "4/4" }
  ]);
  const [isCreating, setIsCreating] = useState(false);

  const addSong = () => {
    setSetlist([...setlist, { id: Date.now(), title: "", bpm: 120, timeSignature: "4/4" }]);
  };

  const updateSong = (index: number, field: string, value: string | number) => {
    const newList = [...setlist];
    newList[index] = { ...newList[index], [field]: value };
    setSetlist(newList);
  };

  const removeSong = (index: number) => {
    if (setlist.length > 1) {
      setSetlist(setlist.filter((_, i) => i !== index));
    }
  };

  const handleCreate = async () => {
    if (!title || setlist.length === 0) return;
    setIsCreating(true);
    
    try {
      const roomsRef = ref(database, 'rooms');
      const newRoomRef = push(roomsRef);
      
      await set(newRoomRef, {
        title,
        date,
        setlist,
        state: {
          isPlaying: false,
          currentSongIndex: 0,
          bpm: setlist[0].bpm,
          startTime: 0
        },
        createdAt: Date.now()
      });
      
      router.push(`/room/${newRoomRef.key}?admin=true`);
    } catch (error) {
      console.error("Error creating room:", error);
      alert("방 생성 중 오류가 발생했습니다. Firebase 설정을 확인해주세요.");
      setIsCreating(false);
    }
  };

  return (
    <main className="app-container" style={{ overflowY: 'auto' }}>
      <header className="header" style={{ marginBottom: '2rem' }}>
        <Link href="/" style={{ color: 'var(--text-color)', textDecoration: 'none' }}>
          <div className="brand">TEMPO</div>
        </Link>
        <div className="status">NEW WORSHIP</div>
      </header>

      <section style={{ marginBottom: '2rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: '#999', fontWeight: 700 }}>예배/집회 이름</label>
          <input 
            type="text" 
            placeholder="예: 7월 여름수련회 저녁집회" 
            className="input-field"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: '#999', fontWeight: 700 }}>일자</label>
          <input 
            type="date" 
            className="input-field"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>
      </section>

      <section style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 900 }}>세트리스트 구성</h2>
          <button onClick={addSong} style={{ background: 'transparent', color: 'var(--accent-color)', border: 'none', fontWeight: 900, cursor: 'pointer' }}>+ 곡 추가</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
          {setlist.map((song, idx) => (
            <div key={song.id} style={{ background: 'var(--surface-color)', padding: '1rem', borderRadius: '12px', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 700, color: '#999' }}>#{idx + 1}</span>
                {setlist.length > 1 && (
                  <button onClick={() => removeSong(idx)} style={{ background: 'transparent', color: '#ff3366', border: 'none', cursor: 'pointer', fontWeight: 900 }}>삭제</button>
                )}
              </div>
              <input 
                type="text" 
                placeholder="곡명 (예: 예수 이름 높이세)" 
                className="input-field"
                style={{ marginBottom: '0.5rem' }}
                value={song.title}
                onChange={e => updateSong(idx, 'title', e.target.value)}
              />
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', color: '#666' }}>BPM</label>
                  <input 
                    type="number" 
                    className="input-field"
                    value={song.bpm}
                    onChange={e => updateSong(idx, 'bpm', parseInt(e.target.value) || 0)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', color: '#666' }}>박자</label>
                  <select 
                    className="input-field"
                    value={song.timeSignature}
                    onChange={e => updateSong(idx, 'timeSignature', e.target.value)}
                  >
                    <option value="4/4">4/4</option>
                    <option value="3/4">3/4</option>
                    <option value="6/8">6/8</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <button 
        className="play-btn" 
        style={{ width: '100%', padding: '1.25rem', marginTop: 'auto', opacity: (!title || isCreating) ? 0.5 : 1 }}
        onClick={handleCreate}
        disabled={!title || isCreating}
      >
        {isCreating ? '생성 중...' : '방 생성 및 시작하기'}
      </button>

      <style dangerouslySetInnerHTML={{__html: `
        .input-field {
          width: 100%;
          background: #111;
          border: 1px solid #333;
          color: white;
          padding: 1rem;
          border-radius: 8px;
          font-family: inherit;
          font-size: 1rem;
          font-weight: 700;
        }
        .input-field:focus {
          outline: none;
          border-color: var(--accent-color);
        }
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(1);
          cursor: pointer;
        }
      `}} />
    </main>
  );
}
