import RegisterForm from '@/components/RegisterForm';

export const metadata = { title: 'ユーザー登録 | efootleaguemaker' };

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-xl px-5 py-16">
      <p className="label mb-3">Step 01 / 登録</p>
      <h1 className="headline text-4xl text-chalk">ユーザー登録</h1>
      <p className="mt-4 text-sm text-white/50">
        ここで登録した efootball ID が、以降すべての申し込みのキーになります。
      </p>
      <RegisterForm />
    </div>
  );
}
