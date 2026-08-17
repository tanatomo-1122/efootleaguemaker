import MyPage from '@/components/MyPage';

export const metadata = { title: 'マイページ | efootleaguemaker' };

export default function MePage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <p className="label mb-3">My Page</p>
      <h1 className="headline text-5xl text-chalk">マイページ</h1>
      <p className="mt-4 text-sm text-white/50">
        参加中のリーグ、主催しているリーグ、そして自分がやるべきことをまとめて確認できます。
      </p>
      <MyPage />
    </div>
  );
}
