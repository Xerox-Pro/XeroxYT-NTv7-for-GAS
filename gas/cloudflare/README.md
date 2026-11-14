# 既存APIにGAS専用の共有鍵を追加する場合

`gas-key.mjs` は、稼働中APIの既存 `API_SHARED_SECRET` を保持したまま `GAS_API_SHARED_SECRET` を追加する任意の入口です。新規にAPIを構築する基本手順では不要です。

今回の既存APIにはこの入口を適用しています。GAS側ではプロパティ名を `API_SHARED_SECRET` のままにして、値にGAS専用鍵を入力します。`UPSTREAM_ORIGIN` は `https://script.google.com` です。鍵の実際の値はリポジトリへ保存しません。

GAS専用鍵とOriginを確認した通信だけ、サーバー内で従来の認証ヘッダーへ変換して元のAPIへ渡します。既存のサイト用共有鍵・DB・セッションの署名鍵は変更しません。Origin単体で認証する仕組みではありません。

## APIを再ビルド・再公開するとき

元のAPIだけを上書きするとGAS専用鍵の受付が外れるため、この入口も同時に配置してください。

1. APIのビルド生成物と同じフォルダへ `gas-key.mjs` をコピー。
2. 同じフォルダに次の `gas-entry.mjs` を作成。`bundle.mjs` は実際の元APIのエントリーファイル名に合わせる（今回の稼働版は `worker.mjs`）。

```js
import worker from './bundle.mjs';
import {withGasKey} from './gas-key.mjs';
export default withGasKey(worker);
```

3. Wranglerの `main` をこの `gas-entry.mjs` に指定。既存のDB・BROWSER等のbindingと `nodejs_compat` を保持。
4. `API_SHARED_SECRET` と `GAS_API_SHARED_SECRET` をそれぞれ既存値のまま保持し、デプロイ。秘密鍵をコードに書かない。

GASからの新しい鍵で未ログインの `/api/account/session` が401、不正な鍵が403になることを確認してください。稼働版では `/api/health` もサイトログインが必要なため、未ログイン時は401です。

## 有効なGASセッションの自動延長

GAS専用鍵で認証された `/api/account/session` が成功した場合だけ、DBの `sessions` にある有効なセッションを最長1年先へ更新し、新しい有効期限のCookieを返します。更新は期限に7日以上の差がある場合だけ行います。GAS側では `/api/account/session` のSet-Cookieも保存する最新Code.gsが必要です。APIの認証拒否時や失効済みのセッションは延長しません。
