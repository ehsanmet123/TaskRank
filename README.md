# TaskRank

A minimal Expo / React Native app. Your list order answers “What should I do next?”

## Run

Requires Node.js 22.18+ (Node 24 recommended).

```sh
npm install
npm start
```

Open the QR code with an Expo Go version supporting SDK 57. Android can also run with `npm run android` and an installed emulator. iOS simulator requires macOS. `npm run web` opens the browser version.

## Install on Android as a standalone app

The `preview` profile in `eas.json` builds a release APK with the JavaScript bundled inside, without a development server or Expo Go. The app follows the device orientation, including on Android tablets.

From PowerShell in this project folder:

```powershell
npx.cmd --yes eas-cli@latest login
npx.cmd --yes eas-cli@latest build --platform android --profile preview
```

The first build may ask to create/link an Expo project and generate an Android signing key. Keep the same Expo project and signing key for subsequent updates. Open the resulting APK download link on Android and install it. Tasks previously entered in Expo Go do not automatically transfer to the standalone app.

## Using TaskRank

- Tap **Add Task**, enter a title, and submit. New tasks go to the bottom.
- Hold a task row or its handle, then drag to change its position.
- Tap the square to finish a task. Remaining ranks close the gap immediately.
- Open **Done** to see completed tasks, newest first. Tap the restore arrow to return one to the bottom of Tasks.

The initial list is empty. Data stays on the device using AsyncStorage. Browser preview data is separate from phone data. There are no accounts, network services, priorities, or stored rank numbers. Rank is the active array index plus one.

### Android backup

The Android app explicitly enables Android Auto Backup (`android.allowBackup: true`). Android can back up TaskRank's local app data, including its AsyncStorage task database, to the user's Google account and restore it after an uninstall or a move to another Android device. The device owner must have Android backup enabled, and Android decides when it runs a backup. This is recovery, not immediate syncing: a recent change may not be included until Android completes a backup. Clearing Android app data can still remove the local list; deleting the device's Google backup also prevents restoration.

### Google cloud sync setup

TaskRank uses Google sign-in through Supabase. Before building a release, run [`supabase/taskrank-cloud.sql`](supabase/taskrank-cloud.sql) in the Supabase SQL Editor. Then, in Supabase Auth settings, add `taskrank://auth/callback` to the Redirect URLs. In the Google Auth Platform console, create a **Web application** OAuth client, add your Supabase callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) as an authorized redirect URI, and paste the client ID and secret into the Google provider configuration in Supabase. Never put the Google client secret or a Supabase service-role key in the app.

### Windows corner widget

TaskRank includes a Windows companion widget. It stays above other applications in the lower-right corner, displays today's selected tasks, and can complete or restore them. It syncs through the same Supabase account as the Android app.

Before packaging it, add `taskrank-desktop://auth/callback` to Supabase **Authentication → URL Configuration → Redirect URLs**. Then create the installer with:

```powershell
npm run desktop:dist
```

The installer is written to `desktop/dist/TaskRank Setup <version>.exe`. Install it, select **Connect Google**, and sign in with the same Google account used on Android.

## Verification

```sh
npm run typecheck
npm test
npm run export
```

Tests cover rank gaps, adding/restoring, reorder persistence, stale drag data, and invalid storage. Export produces Android, iOS, and web bundles; it is not a signed installable app. Run a final touch/long-press check in Expo Go on a physical phone before distributing.

`src/tasks.ts` contains pure task operations and storage validation. `App.tsx` contains the screens and serialized AsyncStorage writes. Loading failures preserve existing storage; write failures show a retry banner.

Drag integration follows the [Draggable FlatList documentation](https://github.com/computerjazz/react-native-draggable-flatlist); native dependencies were installed through [Expo install](https://docs.expo.dev/versions/latest/sdk/gesture-handler/).

test
