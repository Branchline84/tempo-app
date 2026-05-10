import Link from 'next/link';

export default function Landing() {
  return (
    <main className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="brand" style={{ fontSize: '4rem', marginBottom: '3rem', letterSpacing: '-2px' }}>TEMPO</div>
      
      <Link href="/create" style={{ textDecoration: 'none' }}>
        <button className="play-btn" style={{ padding: '1rem 4rem', fontSize: '1.5rem' }}>
          새 예배 세팅하기
        </button>
      </Link>
    </main>
  );
}
