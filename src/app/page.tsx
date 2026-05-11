"use client";

import { useState, useEffect } from "react";
import Link from 'next/link';
import { database } from "@/lib/firebase";
import { ref, onValue, remove } from "firebase/database";

export default function Landing() {
  const [rooms, setRooms] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const roomsRef = ref(database, 'rooms');
    const unsubscribe = onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const roomsList = Object.entries(data).map(([id, value]: [string, any]) => ({
          id,
          ...value
        })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setRooms(roomsList);
      } else {
        setRooms([]);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleDelete = async (id: string, title: string) => {
    if (window.confirm(`'${title}' 예배를 삭제하시겠습니까?`)) {
      try {
        const roomRef = ref(database, `rooms/${id}`);
        await remove(roomRef);
      } catch (error) {
        console.error("Error deleting room:", error);
        alert("삭제 중 오류가 발생했습니다.");
      }
    }
  };

  return (
    <main className="app-container" style={{ overflowY: 'auto' }}>
      <header className="header" style={{ marginBottom: '3rem', justifyContent: 'center' }}>
        <div className="brand" style={{ fontSize: '3rem', letterSpacing: '-2px' }}>TEMPO</div>
      </header>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
        <Link href="/create" style={{ textDecoration: 'none' }}>
          <button className="play-btn" style={{ width: '100%', padding: '1.5rem', fontSize: '1.25rem' }}>
            + 새 예배 세팅하기
          </button>
        </Link>

        <section>
          <h2 style={{ fontSize: '1rem', color: '#666', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '1.5rem', fontWeight: 900 }}>
            최근 예배 목록
          </h2>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>불러오는 중...</div>
          ) : rooms.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--surface-color)', borderRadius: '16px', color: '#666' }}>
              저장된 예배가 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {rooms.map((room) => (
                <div key={room.id} style={{ background: 'var(--surface-color)', padding: '1.5rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 900, marginBottom: '0.25rem' }}>{room.title}</h3>
                      <div style={{ fontSize: '0.875rem', color: '#999', fontWeight: 700 }}>
                        {room.date || '날짜 미지정'} • {room.setlist?.length || 0}곡
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDelete(room.id, room.title)}
                      style={{ background: 'transparent', border: 'none', color: '#ff3366', fontWeight: 900, cursor: 'pointer', fontSize: '0.75rem', padding: '0.5rem' }}
                    >
                      DELETE
                    </button>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Link href={`/room/${room.id}?admin=true`} style={{ flex: 1, textDecoration: 'none' }}>
                      <button style={{ 
                        width: '100%', 
                        padding: '0.75rem', 
                        borderRadius: '8px', 
                        border: 'none', 
                        background: 'var(--accent-color)', 
                        color: '#000', 
                        fontWeight: 900, 
                        fontSize: '0.875rem',
                        cursor: 'pointer'
                      }}>
                        MASTER
                      </button>
                    </Link>
                    <Link href={`/room/${room.id}`} style={{ flex: 1, textDecoration: 'none' }}>
                      <button style={{ 
                        width: '100%', 
                        padding: '0.75rem', 
                        borderRadius: '8px', 
                        border: '1px solid #444', 
                        background: 'transparent', 
                        color: '#fff', 
                        fontWeight: 900, 
                        fontSize: '0.875rem',
                        cursor: 'pointer'
                      }}>
                        VIEWER
                      </button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
