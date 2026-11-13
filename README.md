# XeroxYT-NTv7 for GAS

Google Apps Script専用の独立したフロントエンドです。YouTube・Instagram・TikTokの既存画面をGASのHTML Serviceで起動し、JSON APIをGAS経由で呼び出します。

- [GASの設定・公開・更新手順](gas/README.md)
- [自分専用APIの構築手順](gas/API_SETUP.md)
- [GASへコピーするファイル](gas/)
- [配信用JS・CSS](https://github.com/Xerox-Pro/XeroxYT-NTv7-for-GAS/tree/gas-runtime/gas/web)
- [Vercel版](https://github.com/Xerox-Pro/XeroxYT-NTv7)

## このリポジトリの構成

`src/` はGAS版の画面ソース、`gas/client/` はGAS通信・ハッシュルーター、`gas/Code.gs` はサーバー中継です。VercelのAPI関数・サーバー・デプロイ設定は含みません。バックエンドは別途、自分のCloudflareアカウントへ構築します。

```sh
npm ci --ignore-scripts
npm test
npm run lint
npm run build
```

mainへの更新時、GitHub ActionsがGAS版をビルドし、gas-runtimeへJS・CSSを配信します。同じGAS公開URLから最新版を読み込みます。GAS側ではASSET_REPOを `Xerox-Pro/XeroxYT-NTv7-for-GAS` に設定してください。Forkした場合は自分のリポジトリ名を指定します。

APIのURLと共有鍵はGASのスクリプトプロパティに設定します。ソースやブラウザ向けJSに入力しないでください。

## 旧リポジトリからの切り替え

以前のGAS版を公開済みの場合、スクリプトプロパティの `ASSET_REPO` を `Xerox-Pro/XeroxYT-NTv7-for-GAS` に変更してください。ASSET_BRANCHはgas-runtimeのままです。GASの公開URLは変わりません。

ASSET_REPOを未設定で旧コードの既定値を利用している場合は、このプロパティを追加するだけで切り替えられます。Code.gsも更新する場合は、既存デプロイを編集して新しいバージョンへ更新すれば同じURLを維持できます。

## 制約と検証

動画のバイナリ・Rangeストリーミング中継、PWA、SNS OAuthの戻り先にはGASの制約があります。完全互換の保証はありません。詳しくはGAS手順書を参照してください。GAS公開・実APIログイン・動画再生は利用者の環境で確認が必要です。
