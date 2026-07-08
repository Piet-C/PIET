const nextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "pub-08323d96cffd4fa995d320dd3deca113.r2.dev" },
    ],
  },
  serverExternalPackages: ["sharp"],
}
export default nextConfig
