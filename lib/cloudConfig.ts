// Firebase の設定値をここに入れると、リアルタイム同期がオンになります。
// 空のままだと、これまで通り各端末の localStorage のみで動作します（同期なし）。
//
// 取得方法：Firebase コンソール → プロジェクトの設定 → 「マイアプリ」→ ウェブアプリ
// の firebaseConfig をコピーして下の各値に貼り付け。
export const cloudConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};
