/** @type {import('next').NextConfig} */

// GitHub Pages（project site）では /umazumi-yard/ 配下に置かれるため basePath を付ける。
// ローカル開発（PAGES 未設定）では付けない。
const isPages = process.env.PAGES === "1";
const repo = "umatsumi-yard";

const nextConfig = {
  output: "export", // 静的書き出し（out/）
  images: { unoptimized: true },
  trailingSlash: true,
  basePath: isPages ? `/${repo}` : undefined,
  assetPrefix: isPages ? `/${repo}/` : undefined,
};

export default nextConfig;
