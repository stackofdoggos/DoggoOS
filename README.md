# milesOS 

fake mac desktop in a browser. made it for my site so people can poke around and see my stuff

live: **https://milesaguilar.com/OS/**

---

## whats on the desktop

**Welcome** — opens on load. has a pic of me, oceans 11 gif, spotify link. pokeball in the top bar also opens it.

**Notes** — kartana themed notes app. sidebar, rich text toolbar, saves to your browser localStorage (not my server, i dont want your notes).

**jpokemon** — this ones the flex tbh. its a canvas port of a java swing project i wrote (route 101 overworld, brendan walking around, tall grass ruffles, sign dialogue with the actual emerald font assets). fixed size window on purpose. github for the java version: https://github.com/stackofdoggos/jpokemon

theres a little dog that walks in the menu bar.

---

## run it locally

no build step its just files

```bash
cd DoggoOS
python3 -m http.server 8000
```

then http://localhost:8000 — if youre testing the /OS path stuff use the base tag or put it in a folder named OS

---

## deploy

namecheap stellar plus, files go in `public_html/OS/`. theres a zip script:

```bash
./deploy/build-zip.sh
```

upload `deploy/milesOS-deploy.zip` to cpanel and extract. more detail in `deploy/DEPLOY.md` if i forgot something here.

branch for the live site is `windows`.

---

## stack

html css vanilla js. no react no vite no nothing. window manager is in `script.js` — drag titlebars, minimize to dock, maximize (except jpokemon window thats locked).

assets are mostly pngs/gifs i already had sitting around plus jpokemon art copied from my java project.

---

## random notes

- repo folder says DoggoOS, site says milesOS. same thing.
- notes app key in localStorage is `milesos:notes:v1` if youre wondering where your stuff went
- jpokemon controls: wasd, space/e for signs, enter to advance text

if something breaks on mobile… yeah its a desktop cosplay site sorry
