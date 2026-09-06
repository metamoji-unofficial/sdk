# metamoji-api

MetaMoji ClassShare クラウドAPI の TypeScript クライアント。
[`docs/typespec`](../docs/typespec) の全 **131 オペレーション**を Resend 風の
リソース指向インターフェースで網羅しています。

> ⚠️ **非公式**。元になった `docs/typespec` 自体が
> `com.metamoji.share_classroom` 3.15.1.0 (APK) の smali をリバースエンジニアリング
> して再構築した推測込みのドキュメントです。MetaMoji社の公式仕様ではなく、実サーバーの
> 挙動と一致する保証もありません。利用は自己責任で。

## 使い方

```ts
import { Metamoji } from "metamoji-api";

const metamoji = new Metamoji({ locale: "ja_JP" });

const { data, error } = await metamoji.auth.login({
  coLoginId: "school-code",
  loginName: "teacher",
  password: "…",
});
if (error) {
  console.error(error.name, error.message);
} else {
  console.log(data.name, data.restHost);
}

// ログインで restHost・セッションCookie・ユーザー情報が自動的に取り込まれるので、
// 以降のリソースはそのまま呼べる。
const drives = await metamoji.drives.getPrivateHome();
const rooms = await metamoji.rooms.list();
```

Resend と同じく、**すべてのメソッドは `{ data, error }` を返し、API エラーで
throw しません**。ネットワーク障害・非 2xx ステータス・`errorCode !== 0` の
いずれも `error` に入ります (引数不足のようなプログラマのミスだけは throw します)。

```ts
const { data, error } = await metamoji.drives.create({ driveName: "3年2組" });
if (error) return;      // error: MetamojiError
data.driveId;           // ここでは data は非 null に絞り込まれている
```

## リソース一覧

| プロパティ | 担当 | 由来 |
| --- | --- | --- |
| `auth` | ログイン / 登録 / パスワード / EULA / SSO | `CsCloudService` |
| `users` | ユーザー・組織情報 | `CsCloudService` |
| `drives` / `links` | 共有フォルダ・メンバー・共有リンク | `CsCloudService` |
| `sync` | ドライブ/ドキュメント同期 (次世代REST) | `SdCloudService` |
| `webdav` | ノート本体のデータプレーン | `NwWebDAVRequest` |
| `classBoxes` | クラスボックス | `CsCloudService` |
| `rooms` | リアルタイム授業ルーム | `NsCollaboURLConnection` |
| `distribute` | クラス配信・クラッシュログ | `DvmCloudService` |
| `gradebook` | 成績表・テストログ | `forSchool.service` |
| `media` | ギャラリーメディア (音声・写真) | `media.service` |
| `video` | 動画ノート (Flora) | `NwServerAccessor` |
| `messages` | ダイレクトメッセージ | `CsCloudService` |
| `licensing` | ライセンス・課金 | `CsCloudService` |
| `licenseActivation` | シリアルキーのアクティベーション | `LicenseUtil` |
| `settings` | クライアント設定同期 | `CsCloudService` |
| `sysInfo` | 起動時マニフェスト / Mazec辞書 | `NtSysInfoManager` |
| `system` | メンテナンス情報・操作ログ | `CsCloudService` |
| `libraryStore` | レガシーコンテンツストア | `com.metamoji.lb` |
| `converter` | リモートファイル変換 (到達不能) | `com.metamoji.rc` |

## 設計上、知っておくとよいこと

このAPIには「普通のRESTクライアントならこう書く」を裏切る箇所がいくつもあります。
どれもアプリの実装に合わせたもので、バグではありません。

### ベースURLは1つではない

ログイン前のルートサーバー、ログイン後のテナント別 `restHost`、ドライブごとの
`homeDir`、セッションごとの Flora サーバー、CDN、ライセンス専用ホスト、そして
サーバーが払い出す絶対URL (WebDAV・ストアのページ・アップロード先) が並存します。

`auth.login()` が `restHost` を、`drives.getHome()` / `drives.getPrivateHome()` が
`homeDir` を自動で取り込みます。それ以外は明示的に設定してください。

```ts
const metamoji = new Metamoji({
  rootServer: "https://mps.metamoji.com/",  // 既定値
  floraServer: "flora7.example.com",        // 動画を使うときだけ
});
metamoji.configure({ homeDir: "https://drive.example/" });
```

### GET / DELETE がJSONボディを送る

`CsParamBaseAbstract#stringify()` はHTTPメソッドに関係なくボディを組み立てます。
つまり `GET /users2/login/user` はパラメータをボディで送ります。`fetch` はこれを
拒否する (`Request with GET/HEAD method cannot have body`) ため、**該当リクエストだけ
`node:http` に迂回**します。その他は `fetch` を通るので、ブラウザや Tauri の WebView でも
該当エンドポイントを避ける限り動きます。

`node:http` が無い環境では `dropBodyOnGet: true` でボディを落として送れますが、
サーバーがパラメータ不足で弾く可能性があります。

### セッションは1つではない

`CsCloudService` / `SdCloudService` / ギャラリーメディア / 授業ルーム / ストア /
Flora はそれぞれ独立したCookieセッションです。同一ホストでもジャーを分けているため、
`sync.login()` がメインのセッションを上書きすることはありません。
Cookieの `Domain` 属性は解釈します (ログインはルートサーバー、以降はテナントホスト、
という流れがこれに依存しているため)。

### 自動再ログインは、アプリが実装している3箇所だけ

`SdCloudService` の `errorCode 0x2af9`、ギャラリーメディアの HTTP 403、
レガシーストアの `result: "1"` — この3つだけ、1回だけ再ログインして再試行します
(`autoLogin: false` で無効化)。それ以外のエンドポイントで勝手にリトライはしません。

### 真偽値が文字列で飛ぶ

`sync` の `force` / `isAll` / `fromV2` は、`toMap()` が `String` として積むため
ワイヤー上は `"true"` / `"false"` です。ラッパーは `boolean` を受け取って変換します。

### レスポンスがJSONとは限らない

ギャラリーメディアの大半は改行・カンマ区切りのプレーンテキストを返します
(`media.upload()` なら「進捗行 → `finish` → `0,…`」)。ラッパーがパースして
`{ statusCode, raw }` などに整えますが、`raw` に原文も残しています。
メンテナンス情報も同様にテキストです。

### 複数IDは配列ではなく連番パート

`media.getStatus({ ids: ["a","b"] })` は `recordId0=a&recordId1=b` として送られます。
`idKind: "clientMediaId"` を渡すと**フィールド名ごと** `clientMediaId0`, … に変わります。

### WebDAV は本物の動詞を送る

TypeSpec には `MKCOL` / `MOVE` / `PROPFIND` / `PROPPATCH` のデコレータが無く `@post` で
近似されていますが、このクライアントは実際の動詞を送ります。`PROPFIND` の
マルチステータスXMLは依存ライブラリなしでパースし、`DAV:` の live property と
MetaMoji独自の dead property (`lastSyncedRevision` など) を分けて返します。

## 設定

```ts
new Metamoji({
  // ホスト
  rootServer, restHost, dcServer, homeDir, floraServer,
  cdnServer, mazecCdnServer, licenseServer,
  maintenanceUrl,       // system.getMaintenanceInfo() 用 (login の maintCheckURL)
  syncMaintenanceUrl,   // sync.getMaintenanceInfo() 用 (drives.getHome の maintenanceText)

  // 端末・製品の識別子 (リクエストのヘッダ/フィールドに載る)
  productName, productVersion, appVersion,
  deviceName, locale, timezone, device, deviceId, deviceCode,

  // 挙動
  session,          // 事前に分かっている資格情報
  headers,          // 全リクエストに追加
  timeout,          // 既定 30000ms、0 で無効
  fetch,            // 差し替え用 fetch (Tauri など)
  transport,        // トランスポートごと差し替え (テスト用)
  cookies,          // 既定 true
  dropBodyOnGet,    // 既定 false
  autoLogin,        // 既定 true
});
```

`session` は、Cookieを使わずリクエストごとに資格情報を送るサブシステム
(`rooms` / `media` / `video` / `distribute` / `converter`) が参照します。
`auth.login()` が自動で埋めますが、直接指定もできます。

```ts
metamoji.setSession({ userId: "u1", qwd: "…", companyId: "c1" });
```

## エラー

```ts
interface MetamojiError {
  name: string;              // サーバーの errorName、または下記のクライアント側の名前
  message: string;
  statusCode?: number;       // HTTPステータス (レスポンスが返った場合)
  code?: number | string;    // サブシステム固有の結果コード
  data?: unknown;            // errorData、または生ボディ
}
```

クライアント側が付ける `name`: `network_error` / `timeout` / `invalid_response` /
`http_error` / `application_error` / `not_configured` / `login_required` /
`unsupported_environment` / `hash_mismatch`。

代表的なコードは定数として公開しています
(`SD_NOT_LOGIN`, `SD_REVISION_CONFLICT`, `STORE_LOGIN_REQUIRED`,
`GALLERY_DELETE_ALREADY_GONE`, `RC_CONVERTING`, `RC_NO_LICENSE`)。

## 開発

```bash
bun install
bun run typecheck
bun run test
bun run build
```

依存パッケージはありません (devDependencies のみ)。Node 18以降。

`src/coverage.test.ts` は `docs/typespec` を**実行時に読み直して**オペレーション一覧を
再構築し、全件がクライアントのメソッドに1対1で対応することを検証します。
TypeSpec にオペレーションを足すと、ラッパーを追従させるまでテストが落ちます。

## エンドポイント網羅表

全131オペレーション。パスは各サブシステムのベースURLからの相対です。


### `auth/auth.tsp` — 認証・アカウント管理

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `Auth.login` | POST | `/users3/login` | `metamoji.auth.login()` |
| `Auth.classRoomLogin` | POST | `/users3/classroomlogin` | `metamoji.auth.classroomLogin()` |
| `Auth.getClassRoomLoginInfo` | POST | `/users3/getclassroominfo` | `metamoji.auth.getClassroomLoginInfo()` |
| `Auth.logout` | POST | `/users3/logout` | `metamoji.auth.logout()` |
| `Auth.register` | POST | `/users2/register` | `metamoji.auth.register()` |
| `Auth.withdraw` | POST | `/users2/withdraw/` | `metamoji.auth.withdraw()` |
| `Auth.changePassword` | PUT | `/users2/change/password` | `metamoji.auth.changePassword()` |
| `Auth.resetPassword` | POST | `/users2/reissue/password` | `metamoji.auth.resetPassword()` |
| `Auth.lockUser` | POST | `/users2/lock` | `metamoji.auth.lockUser()` |
| `Auth.unlockUser` | POST | `/users2/unlock` | `metamoji.auth.unlockUser()` |
| `Auth.agreeEula` | POST | `/users2/eula/agree` | `metamoji.auth.agreeEula()` |
| `Auth.getCredential` | POST | `/sso/requestcredential` | `metamoji.auth.getCredential()` |

### `auth/user.tsp` — ユーザー・組織情報

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `Users.getUserInfo` | GET | `/users2/login/user` | `metamoji.users.get()` |
| `Users.updateUserInfo` | PUT | `/users2/login/user` | `metamoji.users.update()` |
| `Users.getUserAndSystemInfo` | GET | `/system2/user2` | `metamoji.users.getWithSystemInfo()` |
| `Users.getAllUsers` | POST | `/users3/getallusers` | `metamoji.users.list()` |
| `Users.getAllGroups` | POST | `/users3/getallgroups` | `metamoji.users.listGroups()` |
| `Users.getUserNames` | POST | `/users3/login/company/usernames` | `metamoji.users.resolveNames()` |

### `drive/drive.tsp` — ドライブ・共有フォルダ

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `Drives.createDrive` | POST | `/drives/create` | `metamoji.drives.create()` |
| `Drives.deleteDrive` | DELETE | `/drives/{driveId}/data` | `metamoji.drives.remove()` |
| `Drives.renameDrive` | POST | `/drives/renamedrive` | `metamoji.drives.rename()` |
| `Drives.getDriveHome` | GET | `/drives/{driveId}/home` | `metamoji.drives.getHome()` |
| `Drives.getPrivateDriveHome` | GET | `/v3/users/login/home` | `metamoji.drives.getPrivateHome()` |
| `Drives.getDriveEntry` | GET | `/drives/entry` | `metamoji.drives.listEntries()` |
| `Drives.getDriveEntryInfo` | GET | `/drives/entryinfo` | `metamoji.drives.getEntryInfo()` |
| `Drives.updateEntryHidden` | POST | `/drives/entryhidden` | `metamoji.drives.updateEntryHidden()` |
| `Drives.getDriveMemberList` | GET | `/drives/{driveId}/allmembers2` | `metamoji.drives.listMembers()` |
| `Drives.inviteToDrive` | POST | `/drives/{driveId}/invite2` | `metamoji.drives.invite()` |
| `Drives.reInviteToDrive` | POST | `/drives/{driveId}/reinvite` | `metamoji.drives.reInvite()` |
| `Drives.excludeMemberFromDrive` | POST | `/drives/{driveId}/members/users` | `metamoji.drives.excludeMembers()` |
| `Drives.unreferenceDrive` | DELETE | `/drives/{driveId}/members/own` | `metamoji.drives.leave()` |
| `Drives.updateMemberType` | POST | `/drives/{driveId}/members/type` | `metamoji.drives.updateMemberType()` |
| `Drives.getStorageUsage` | POST | `/users2/recalc` | `metamoji.drives.getStorageUsage()` |
| `Drives.createLink` | POST | `/link/create` | `metamoji.links.create()` |
| `Drives.reverseLink` | POST | `/link/reverse` | `metamoji.links.reverse()` |

### `drive/sync-drive.tsp` — ドライブ同期 (次世代REST API)

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `SyncDrive.login` | POST | `/rest/users/login` | `metamoji.sync.login()` |
| `SyncDrive.syncStart` | GET | `/rest/drives/{driveId}/syncstart` | `metamoji.sync.syncStart()` |
| `SyncDrive.getDriveData` | GET | `/rest/drives/{driveId}/data` | `metamoji.sync.getDriveData()` |
| `SyncDrive.getDriveLastUpdateRevision` | GET | `/rest/drives/{driveId}/lastupdaterevision` | `metamoji.sync.getDriveLastUpdateRevision()` |
| `SyncDrive.getDriveProperties` | GET | `/rest/drives/{driveId}/properties` | `metamoji.sync.getDriveProperties()` |
| `SyncDrive.putDriveData` | PUT | `/rest/drives/{driveId}/data` | `metamoji.sync.putDriveData()` |
| `SyncDrive.getDocumentData` | GET | `/rest/drives/{driveId}/documents/{documentId}/data` | `metamoji.sync.getDocumentData()` |
| `SyncDrive.getDocumentMeta` | GET | `/rest/drives/{driveId}/documents/{documentId}/meta` | `metamoji.sync.getDocumentMeta()` |
| `SyncDrive.getDocumentSearchData` | GET | `/rest/drives/{driveId}/documents/{documentId}/searchdata` | `metamoji.sync.getDocumentSearchData()` |
| `SyncDrive.getDocumentThumbnail` | GET | `/rest/drives/{driveId}/documents/{documentId}/thumbnail` | `metamoji.sync.getDocumentThumbnail()` |
| `SyncDrive.putDocumentData` | PUT | `/rest/drives/{driveId}/documents/{documentId}/data` | `metamoji.sync.putDocumentData()` |
| `SyncDrive.deleteDocumentData` | DELETE | `/rest/drives/{driveId}/documents/{documentId}/data` | `metamoji.sync.deleteDocumentData()` |
| `SyncDrive.turnOnEditFlag` | POST | `/rest/drives/{driveId}/documents/{documentId}/editflag/turnon` | `metamoji.sync.turnOnEditFlag()` |
| `SyncDrive.turnOffEditFlag` | POST | `/rest/drives/{driveId}/documents/{documentId}/editflag/turnoff` | `metamoji.sync.turnOffEditFlag()` |
| `SyncDrive.getMaintenanceInfo` | GET | `{maintenanceUrl}` | `metamoji.sync.getMaintenanceInfo()` |

### `drive/webdav.tsp` — WebDAV データプレーン

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `WebDavStorage.get` | GET | `{resourceUrl}` | `metamoji.webdav.get()` |
| `WebDavStorage.put` | PUT | `{resourceUrl}` | `metamoji.webdav.put()` |
| `WebDavStorage.head` | HEAD | `{resourceUrl}` | `metamoji.webdav.head()` |
| `WebDavStorage.delete` | DELETE | `{resourceUrl}` | `metamoji.webdav.remove()` |
| `WebDavStorage.createDirectory` | MKCOL | `{resourceUrl}` | `metamoji.webdav.createDirectory()` |
| `WebDavStorage.move` | MOVE | `{resourceUrl}` | `metamoji.webdav.move()` |
| `WebDavStorage.propfind` | PROPFIND | `{resourceUrl}` | `metamoji.webdav.propfind()` |
| `WebDavStorage.proppatch` | PROPPATCH | `{resourceUrl}` | `metamoji.webdav.proppatch()` |

### `classroom/classbox.tsp` — クラスボックス

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `ClassBoxes.createClassBox` | POST | `/users3/crbox/create` | `metamoji.classBoxes.create()` |
| `ClassBoxes.joinClassBox` | POST | `/users3/crbox/join` | `metamoji.classBoxes.join()` |
| `ClassBoxes.updateClassBoxInfo` | POST | `/users3/crbox/update` | `metamoji.classBoxes.update()` |
| `ClassBoxes.getClassCode` | POST | `/users3/crbox/get/joincode` | `metamoji.classBoxes.getJoinCode()` |

### `classroom/collabo.tsp` — 授業ルーム共有 (リアルタイム)

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `Collabo.createRoom` | POST | `cosmos/CreateRoom` | `metamoji.rooms.create()` |
| `Collabo.loginRoom` | POST | `cosmos/LoginRoom` | `metamoji.rooms.login()` |
| `Collabo.createUniqueId` | POST | `cosmos/CreateUniqueID` | `metamoji.rooms.createGuestId()` |
| `Collabo.getRoomInfo` | POST | `cosmos/GetRoomInfo` | `metamoji.rooms.get()` |
| `Collabo.modifyRole` | POST | `cosmos/ModifyRole` | `metamoji.rooms.modifyRole()` |
| `Collabo.getMemberList` | POST | `cosmos/GetMemberList` | `metamoji.rooms.listMembers()` |
| `Collabo.getServletInfo` | POST | `cosmos/GetServletInfo` | `metamoji.rooms.getServletInfo()` |
| `Collabo.updateRoomMode` | POST | `cosmos/UpdateRoomInfo` | `metamoji.rooms.updateMode()` |
| `Collabo.updateRoomInfo` | POST | `cosmos/UpdateRoomInfo` | `metamoji.rooms.update()` |
| `Collabo.checkRole` | POST | `mmjcloud/ShareViewGetMyRole` | `metamoji.rooms.checkRole()` |
| `Collabo.getRoomTitleDate` | POST | `mmjcloud/ShareViewGetRoomInfo` | `metamoji.rooms.getTitleDate()` |
| `Collabo.updateRoomTitleDate` | POST | `mmjcloud/ShareViewSetRoomInfo` | `metamoji.rooms.updateTitleDate()` |
| `Collabo.getRoomSetting` | POST | `mmjcloud/ShareViewGetRoomSetting` | `metamoji.rooms.getSetting()` |
| `Collabo.updateRoomSetting` | POST | `mmjcloud/ShareViewSetRoomSetting` | `metamoji.rooms.updateSetting()` |
| `Collabo.getShareViewList` | POST | `mmjcloud/ShareViewGetList` | `metamoji.rooms.list()` |
| `Collabo.toolLogin` | POST | `mmjeditor2/CosmosToolLogin` | `metamoji.rooms.toolLogin()` |
| `Collabo.postGallery` | POST | `gallery/PostForShareAnytime` | `metamoji.rooms.postToGallery()` |

### `classroom/distribute.tsp` — クラス配信

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `Distribute.distributeClass` | POST | `convert/DistributeClass` | `metamoji.distribute.distributeClass()` |
| `Distribute.getDistributeStatus` | POST | `convert/GetDistributeStatus` | `metamoji.distribute.getStatus()` |
| `Distribute.postCrashLogs` | POST | `crashlogs/upload` | `metamoji.distribute.postCrashLogs()` |

### `classroom/gradebook.tsp` — 成績表・テストログ

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `Gradebook.getScoreList` | POST | `/cosmos/GetScoreList` | `metamoji.gradebook.getScores()` |
| `Gradebook.getTestingLogList` | POST | `/cosmos/GetTestingLogList` | `metamoji.gradebook.getTestingLog()` |
| `Gradebook.setReport` | POST | `/cosmos/SetReport` | `metamoji.gradebook.setReport()` |
| `Gradebook.setScore` | POST | `/cosmos/SetScore` | `metamoji.gradebook.setScore()` |

### `media/gallery-media.tsp` — ギャラリーメディア

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `GalleryMedia.login` | POST | `gallery/LoginMedia` | `metamoji.media.login()` |
| `GalleryMedia.getMediaList` | GET | `gallery/GetMediaList` | `metamoji.media.list()` |
| `GalleryMedia.getMediaStatus` | GET | `gallery/GetMediaStatus` | `metamoji.media.getStatus()` |
| `GalleryMedia.tentativeRegistMedia` | POST | `gallery/TentativeRegistMedia` | `metamoji.media.register()` |
| `GalleryMedia.uploadMedia` | POST | `gallery/UploadMedia` | `metamoji.media.upload()` |
| `GalleryMedia.getMediaFile` | GET | `gallery/GetMediaFile/` | `metamoji.media.download()` |
| `GalleryMedia.setMediaTitle` | POST | `gallery/SetMediaTitle` | `metamoji.media.setTitles()` |
| `GalleryMedia.deleteMediaFile` | POST | `gallery/DeleteMediaFile` | `metamoji.media.remove()` |

### `media/video.tsp` — 動画ノート

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `VideoNotes.getClipList` | POST | `flora/api/v1/getlist2` | `metamoji.video.list()` |
| `VideoNotes.getClipCount` | POST | `flora/api/v1/getclipcount2` | `metamoji.video.count()` |
| `VideoNotes.getClipInfo` | POST | `flora/api/v1/getclipinfo2` | `metamoji.video.get()` |
| `VideoNotes.getPosterFrame` | POST | `flora/api/v1/getposterframe2` | `metamoji.video.getPosterFrame()` |
| `VideoNotes.deleteClip` | POST | `flora/api/v1/deleteclip2` | `metamoji.video.remove()` |
| `VideoNotes.exportClip` | POST | `flora/api/v1/exportclipinfo2` | `metamoji.video.exportClip()` |
| `VideoNotes.getServerCoInfo` | POST | `flora/api/v1/getcoinfo2` | `metamoji.video.getCompanyInfo()` |
| `VideoNotes.getServerStatus` | POST | `flora/api/v1/getserverstatus2` | `metamoji.video.getServerStatus()` |
| `VideoNotes.getUploadPoint` | POST | `flora/api/v1/getuploadpoint2` | `metamoji.video.getUploadPoint()` |
| `VideoNotes.reserve` | POST | `flora/api/v1/reserve2` | `metamoji.video.reserve()` |
| `VideoNotes.uploadFile` | POST | `{uploadUrl}` | `metamoji.video.uploadFile()` |

### `messaging/messaging.tsp` — ダイレクトメッセージ

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `DirectMessages.getDirectMessage` | GET | `/system2/user/directmessage2/` | `metamoji.messages.get()` |
| `DirectMessages.deleteDirectMessage` | DELETE | `/system2/user/directmessage/` | `metamoji.messages.remove()` |

### `licensing/license.tsp` — ライセンス・課金

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `Licensing.inkAmountSync` | POST | `/License` | `metamoji.licensing.inkAmountSync()` |
| `Licensing.purchaseLicense` | POST | `/Purchase` | `metamoji.licensing.purchase()` |
| `Licensing.dummyPurchaseLicense` | POST | `/DummyPurchase` | `metamoji.licensing.dummyPurchase()` |
| `Licensing.productLicenseSync` | POST | `/ProductLicense` | `metamoji.licensing.productLicenseSync()` |
| `Licensing.simulationPurchase` | POST | `/SimPurchase` | `metamoji.licensing.simulatePurchase()` |
| `Licensing.getShareInfo` | POST | `/GetShareInfo` | `metamoji.licensing.getShareInfo()` |

### `licensing/license-activation.tsp` — ライセンスアクティベーション

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `LicenseActivation.activate` | POST | `license/activate2/` | `metamoji.licenseActivation.activate()` |
| `LicenseActivation.getRemainingDays` | POST | `license/getremainingdays/` | `metamoji.licenseActivation.getRemainingDays()` |

### `licensing/mazec-purchase.tsp` — Mazec辞書アドオン

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `MazecDictionaryUpdateCheck.getSysInfo` | GET | `legacy-mazec-dictionary/sysinfo_Android-Share-G-ClassRoom.json` | `metamoji.sysInfo.getMazecDictionary()` |

### `system/settings.tsp` — クライアント設定

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `ClientSettings.getClientSettings` | POST | `/users2/login/getclientsettings` | `metamoji.settings.get()` |
| `ClientSettings.setClientSettings` | POST | `/users2/login/setclientsettings` | `metamoji.settings.set()` |
| `ClientSettings.getClientFile` | POST | `/users2/login/getclientfile` | `metamoji.settings.getFile()` |
| `ClientSettings.setClientFile` | POST | `/users2/login/setclientfile` | `metamoji.settings.setFile()` |

### `system/sysinfo.tsp` — アプリ設定マニフェスト

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `SysInfo.getSysInfo` | GET | `sysinfo_Android-Share-G-ClassRoom.json` | `metamoji.sysInfo.get()` |

### `system/misc.tsp` — メンテナンス・ログ

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `Misc.getMaintenanceInfo` | GET | `/maintenance2_common.txt` | `metamoji.system.getMaintenanceInfo()` |
| `Misc.addApiLog` | POST | `/users3/apilog/register` | `metamoji.system.addApiLog()` |
| `Misc.postCrashLogs` | GET | `/mpsroot/crashlog/upload` | `metamoji.system.postCrashLogs()` |

### `legacy/library-store.tsp` — レガシーコンテンツストア

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `LibraryStore.login` | POST | `store/Login` | `metamoji.libraryStore.login()` |
| `LibraryStore.getAllPages` | GET | `store/GetAllPages` | `metamoji.libraryStore.listPages()` |
| `LibraryStore.getPage` | GET | `{pageURL}` | `metamoji.libraryStore.getPage()` |
| `LibraryStore.downloadProduct` | GET | `{productURL}` | `metamoji.libraryStore.downloadProduct()` |

### `legacy/remote-converter.tsp` — リモートファイル変換

| TypeSpec operation | HTTP | パス | ラッパーメソッド |
| --- | --- | --- | --- |
| `RemoteConverter.tentativeRegist` | POST | `/convert/TentativeRegist` | `metamoji.converter.register()` |
| `RemoteConverter.convertRequest` | POST | `/convert/ConvertRequest` | `metamoji.converter.convert()` |
| `RemoteConverter.getConvertedFile` | POST | `/convert/GetConvertedFile` | `metamoji.converter.getConvertedFile()` |


### 意図的に含めないもの

- **`classroom/collabo-socket-protocol.md`** — ルーム内のリアルタイム操作同期は
  HTTPではなく `NsCollaboSocket` の生ソケットプロトコルです。HTTPラッパーの対象外。
- **`init/library/*.product`** — レガシーストアの「カタログ初期化」パスは
  ネットワークAPIではなく APK 内蔵アセットのローカルパスです
  (`legacy/library-store.tsp` の訂正節を参照)。
- **`executeWithAutoLoginFor`** — 個別のエンドポイントではなく横断的な仕組みなので、
  上記「自動再ログイン」として実装に埋め込んでいます。
- **`ScCollaboURLConnectionForUpdateDeadlineInfo`** — 送信先は `cosmos/UpdateRoomInfo` で、
  `rooms.update()` / `rooms.updateMode()` と同一エンドポイントです。締切関連のキーは
  `NsRoomInfo` が任意キーを受け付けるのでそのまま渡せます。
- **Mazec のストア課金 / `LbInAppPurchaseUtils.purchaseURL`** — TypeSpec 側で
  デッドコードと確認済みのため、そもそもオペレーションとして定義されていません。
