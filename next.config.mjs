/** @type {import('next').NextConfig} */

// GitHub Pages（project site）では /umazumi-yard/ 配下に置かれるため basePath を付ける。
// ローカル開発（PAGES 未設定）では付けない。
const isPages = process.env.PAGES === "1";
const repo = "umatsumi-yard";

const nextConfig = {
  output: "export", // 静的書き出し（out/）
  // dev サーバーは launch.json が NEXT_DIST_DIR=.next-dev を渡して .next-dev を使う。
  // ビルド(.next)と同時に走ってもディレクトリが衝突しないようにするため。
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: { unoptimized: true },
  trailingSlash: true,
  basePath: isPages ? `/${repo}` : undefined,
  assetPrefix: isPages ? `/${repo}/` : undefined,
};

export default nextConfig;
