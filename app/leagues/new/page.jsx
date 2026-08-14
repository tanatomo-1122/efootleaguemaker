import CreateLeagueForm from '@/components/CreateLeagueForm';

export const metadata = { title: 'リーグ作成 | efootleaguemaker' };

export default function NewLeaguePage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <p className="label mb-3">主催側手順</p>
      <h1 className="headline text-5xl text-chalk">リーグ作成</h1>
      <p className="mt-4 text-sm text-white/50">
        人数とプール数を決めるだけ。規定人数に達した瞬間、募集は自動で締め切られ、
        組み合わせがランダムに抽選されます。
      </p>
      <CreateLeagueForm />
    </div>
  );
}
