/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Supabase Storage の公開URLを next/image で扱えるようにする
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
};

export default nextConfig;
