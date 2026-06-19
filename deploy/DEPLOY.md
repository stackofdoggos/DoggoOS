# Deploy milesOS to Namecheap Stellar Plus

Live URL: **https://milesaguilar.com/OS/** (and **https://www.milesaguilar.com/OS/**)

Source branch: **`windows`** — https://github.com/stackofdoggos/DoggoOS/tree/windows

---

## 1. Connect the domain to your hosting

In **Namecheap → Dashboard → Stellar Plus → Manage**:

1. Open **cPanel** (or “Go to cPanel”).
2. Go to **Domains** → **Domains** (or “Addon Domains”).
3. Add **`milesaguilar.com`** if it is not listed yet.
4. Enable **www** as an alias of the same site (cPanel usually does this automatically).

Your site files live in **`public_html/`** for that domain.

---

## 2. Point DNS to Stellar Plus

In **Namecheap → Domain List → milesaguilar.com → Advanced DNS**:

Remove the **Parking Page** record if it is still there.

Add (values come from cPanel → **Server Information** or welcome email):

| Type  | Host | Value                    |
|-------|------|--------------------------|
| A     | `@`  | Your Stellar Plus IP     |
| CNAME | `www`| `milesaguilar.com.`      |

If Namecheap offers **“Nameservers → Namecheap Web Hosting DNS”**, you can switch to that instead — it auto-configures records.

No email on this domain → you do **not** need MX records.

Wait 5–30 minutes for DNS to propagate.

---

## 3. Upload the site into `public_html/OS/`

### Option A — cPanel File Manager (easiest)

1. cPanel → **File Manager** → `public_html`.
2. Create folder **`OS`** if it does not exist.
3. Open **`OS`**.
4. Upload **`milesOS-deploy.zip`** (build it locally — see below).
5. Select the zip → **Extract**.
6. Confirm **`index.html`** is at `public_html/OS/index.html` (not inside an extra nested folder).

### Option B — FTP

1. cPanel → **FTP Accounts** (or use main account).
2. Connect with FileZilla to `public_html/OS/`.
3. Upload all project files from the **`windows`** branch (same layout as this repo root).

### Option C — cPanel Git

1. cPanel → **Git Version Control** → Clone:
   - URL: `https://github.com/stackofdoggos/DoggoOS.git`
   - Branch: `windows`
2. Copy or symlink the clone contents into `public_html/OS/`  
   (or set the document root to the clone if your plan allows — most shared plans use `public_html/OS/`).

---

## 4. Root redirect (optional but recommended)

So **milesaguilar.com** opens milesOS:

1. In `public_html/`, upload **`deploy/public_html-index.html`** as **`index.html`**.
2. Upload **`deploy/public_html.htaccess`** as **`.htaccess`** (enable “Show Hidden Files” in File Manager).

Result: root → **/OS/** automatically.

---

## 5. HTTPS

cPanel → **SSL/TLS Status** (or **Let’s Encrypt** / **AutoSSL**) → run for **`milesaguilar.com`** and **`www.milesaguilar.com`**.

---

## 6. Verify

- https://milesaguilar.com/OS/
- https://www.milesaguilar.com/OS/
- Open **jpokemon**, walk around, read a sign (assets load from `/OS/jpokemon/...`)

---

## Build deploy zip locally

From the repo root on branch **`windows`**:

```bash
./deploy/build-zip.sh
```

Upload `deploy/milesOS-deploy.zip` to `public_html/OS/` and extract.

---

## Updating after changes

1. Pull latest **`windows`** on your machine or re-run **`build-zip.sh`**.
2. Re-upload changed files (or the whole zip) to `public_html/OS/`.
3. Hard-refresh the browser (Cmd+Shift+R).
