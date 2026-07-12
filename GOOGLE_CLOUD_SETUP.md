# Google Cloud Console Setup & Authentication Design

## 1. Architectural Overview
To securely access the live master spreadsheets hosted on Google Drive without incurring structural cloud costs, the Progressive Web App (PWA) relies on client-side identity federation using **Google Identity Services (OAuth 2.0 Implicit Flow)**. 

The application uses the user's authentic workspace session token to invoke the **Google Picker API** (for file selection) and the **Google Drive/Sheets API** (for fetching records and processing end-of-event batch uploads).

---

## 2. Step-by-Step Google Cloud Console Configuration

### Step 1: Create a Dedicated Cloud Project
1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Log in using the same organizational administrator account that owns or manages the target Google Drive storage space.
3. On the upper-left navigation header, click the project dropdown selection menu and select **"New Project"**.
4. Configure the following project fields:
   * **Project Name:** `social-worker-checkin-pilot`
   * **Organization / Location:** Select your organization or leave it as *No Organization* for the independent pilot.
5. Click **Create** and wait for the resource allocation deployment to complete. Ensure this new project is selected in the console header.

### Step 2: Enable Mandatory Target API Libraries
The application requires explicit permissions to interact with Google Workspace elements. You must enable three separate APIs:
1. In the left-hand navigation sidebar, go to **APIs & Services** > **Library**.
2. Using the centralized search bar, look up, click, and click **Enable** for the following libraries sequentially:
   * **Google Drive API** (Required for duplication, file copying, and reading file metadata)
   * **Google Sheets API** (Required for downloading grid contents and executing batch row updates)
   * **Google Picker API** (Required for rendering the secure graphical directory browse frame)

### Step 3: Configure the OAuth Consent Screen
Before generating access credentials, you must define the user-facing consent boundaries.
1. Navigate to **APIs & Services** > **OAuth consent screen**.
2. **User Type:** Select **Internal** (if your organization uses a Google Workspace domain) so only authorized social workers can access it. If utilizing personal `@gmail.com` accounts for the pilot, select **External** and add the specific worker emails to the "Test users" list. Click **Create**.
3. **App Information:**
   * **App name:** `Control de Asistencia`
   * **User support email:** *[Select your administrator email]*
4. **App Domain (Crucial for GitHub Deployment):**
   * **Authorized domains:** Enter `github.io` (This authorizes any subdomains running your compiled PWA code).
5. **Developer contact information:** Enter your technical point of contact email. Click **Save and Continue**.
6. **Scopes Section:** Click **Add or Remove Scopes**. Manually add the following scopes required for minimal functional execution:
   * `.../auth/drive.file` *(Permits the app to see and edit only files opened/created with this app)*
   * `.../auth/spreadsheets` *(Allows reading and modifying spreadsheet rows)*
7. Click **Save and Continue** to lock in the consent properties.

### Step 4: Provision Credentials (API Key & OAuth Client ID)
The PWA requires two separate authentication components: an API Key (to verify the app's structural identity to the Picker) and an OAuth Client ID (to verify the individual user).

#### A. Generate the API Key
1. Navigate to **APIs & Services** > **Credentials**.
2. Click **+ Create Credentials** at the top of the interface and select **API key**.
3. Copy the string output generated inside the modal window. Label this asset `GOOGLE_API_KEY`.
4. Click **Restrict Key** on that same screen to prevent third-party usage:
   * Under *API restrictions*, check **Restrict key** and choose **Google Picker API** from the dropdown menu. Click **Save**.

AIzaSyBFuHfdUVBpWWt4kh6xp4nCC8O9EOJJ6Sg

#### B. Generate the OAuth 2.0 Client ID
1. On the same **Credentials** screen, click **+ Create Credentials** and choose **OAuth client ID**.
2. Under **Application type**, select **Web application**.
3. **Name:** `PWA Production Client`
4. **Authorized JavaScript origins (Security Baseline):**
   * Add URL 1 (Local development testing environment): `http://localhost:3000` or `http://127.0.0.1:5500`
   * Add URL 2 (Production environment): `https://[your-github-username].github.io`
5. Leave the *Authorized redirect URIs* empty, as the PWA uses the modern implicit pop-up runtime model.
6. Click **Create** and securely record the output string designated as `GOOGLE_CLIENT_ID`.
client Id: 
353214333040-n17faakdju042a4q7uiulnd0adp6kbog.apps.googleusercontent.com
Client secret:
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

---

## 3. Local Technical Secret Verification Checklist

Your codebase must implement these generated properties using client-side environment configurations. Create a local environment template file to hold these variables securely prior to final GitHub Pages deployment:

```env
# Client environment properties - Embedded inside front-end build compilation
VITE_GOOGLE_API_KEY="AIzaSy...Your_Specific_Restricted_API_Key..."
VITE_GOOGLE_CLIENT_ID="123456789-abc...apps.googleusercontent.com"