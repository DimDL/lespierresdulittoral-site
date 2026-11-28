// Toutes les pages : liens e-mail assemblés ici (l'adresse n'est pas en clair dans le HTML).
// Page d'un bien : provenance ?src= dans les mails, visionneuse des photos et des plans.
// Syntaxe limitée à Safari 10 (iPad 4, iOS 10.3) : une syntaxe plus récente ferait refuser tout le script ; verifier.py la refuse.
(() => {
  // Provenance : ?src=vitrine ajoute « (Provenance : vitrine) » au mail prérempli, rien n'est stocké.
  const src = (new URLSearchParams(location.search).get("src") || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30);
  const provenance = src ? "\n(Provenance : " + src + ")\n" : "";
  // Encodage à la main : les clients mail affichent tel quel le « + » d'un encodage de formulaire.
  document.querySelectorAll("a[data-u]").forEach((a) => {
    const adresse = a.dataset.u + "@" + a.dataset.d;
    const q = [];
    if (a.dataset.sujet !== undefined) q.push("subject=" + encodeURIComponent(a.dataset.sujet));
    if (a.dataset.corps !== undefined) q.push("body=" + encodeURIComponent(a.dataset.corps + provenance));
    a.href = "mailto:" + adresse + (q.length ? "?" + q.join("&") : "");
    if (a.hasAttribute("data-affiche")) a.textContent = adresse;
  });

  // Compteur de visites (suivi/worker.js) : seulement si la page porte son adresse, jamais si le navigateur demande à ne pas être suivi.
  // Rien n'est lu ni écrit sur l'appareil ; sendBeacon envoie du texte brut, sans requête préalable CORS.
  const meta = document.querySelector('meta[name="suivi"]');
  const compteur = meta && meta.content;
  const page = document.body.dataset.page;
  const refusSuivi = navigator.globalPrivacyControl === true || navigator.doNotTrack === "1";
  const envoyer = (signal) => {
    if (!compteur || !page || refusSuivi) return;
    const corps = JSON.stringify(Object.assign({ p: page, src: src || undefined }, signal));
    if (!(navigator.sendBeacon && navigator.sendBeacon(compteur, corps))) {
      fetch(compteur, { method: "POST", body: corps, keepalive: true, mode: "no-cors" }).catch(() => {});
    }
  };
  envoyer({ t: "vue", ref: document.referrer || undefined });
  // Temps passé : cumul des moments où la page est visible, envoyé une fois, à la première sortie.
  let visibleDepuis = document.visibilityState === "visible" ? performance.now() : null;
  let cumul = 0;
  let dureeEnvoyee = false;
  const sortie = () => {
    if (visibleDepuis !== null) cumul += performance.now() - visibleDepuis;
    visibleDepuis = null;
    if (!dureeEnvoyee) {
      dureeEnvoyee = true;
      envoyer({ t: "duree", s: Math.round(cumul / 1000) });
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") sortie();
    else visibleDepuis = performance.now();
  });
  window.addEventListener("pagehide", sortie);
  // Demandes de contact : liens marqués data-suivi (appeler, ecrire, visite, dossier).
  document.addEventListener("click", (ev) => {
    const lien = ev.target.closest && ev.target.closest("[data-suivi]");
    if (lien) envoyer({ t: "clic", c: lien.dataset.suivi });
  });

  const donnees = document.getElementById("photos-data");
  const data = donnees && JSON.parse(donnees.textContent);
  const dlg = document.getElementById("visionneuse");
  if (!data || !dlg) return;
  const piste = dlg.querySelector(".v-piste");
  const legende = dlg.querySelector(".v-legende");
  const bande = dlg.querySelector(".v-miniatures");
  const miniatures = Array.prototype.slice.call(dlg.querySelectorAll(".v-miniature"));
  // Galeries : la visite (photos et plans), puis, à part, le chantier ; debut et fin bornent celle qui est ouverte.
  let debut = 0;
  let fin = data.photos.length;
  let courant = 0;
  // Vue demandée par un bouton, une touche ou une miniature : tant qu'elle n'est pas atteinte, le défilement ne change pas la légende.
  let cible = null;
  let finCible = null;
  // Une photo n'est comptée qu'une fois par visite.
  const photosVues = new Set();

  const fichier = (p, w, ext) => `${data.racine}medias/${data.id}/${p.base}-${w}.${ext}`;
  const srcset = (p, ext) => p.largeurs.map((w) => `${fichier(p, w, ext)} ${w}w`).join(", ");

  // Une vue par image, large comme l'écran : la piste défile comme une suite de pages, avec l'inertie et les crans du navigateur.
  // Aucun geste n'est interprété ici : zoomer à deux doigts ne change pas d'image.
  const vues = data.photos.map((p) => {
    const vue = document.createElement("figure");
    vue.className = "v-vue";
    // Vue de fin (page d'ensemble) : un texte et un lien par page de maison, pas d'image.
    if (p.fin) {
      vue.className = "v-vue v-fin";
      const carte = document.createElement("div");
      carte.className = "v-fin-carte";
      const texte = document.createElement("p");
      texte.textContent = p.texte;
      carte.appendChild(texte);
      p.liens.forEach((l) => {
        const a = document.createElement("a");
        a.className = "bouton";
        a.href = l.href;
        a.textContent = l.texte;
        carte.appendChild(a);
      });
      vue.appendChild(carte);
      piste.appendChild(vue);
      return vue;
    }
    vue.innerHTML = '<picture><source type="image/avif"><img></picture>';
    const img = vue.querySelector("img");
    img.alt = p.legende;
    img.width = p.l;
    img.height = p.h;
    piste.appendChild(vue);
    return vue;
  });

  // Rang dans la liste d'un rang relatif à la galerie ouverte, qui boucle sur elle-même.
  const borner = (i) => debut + (((i - debut) % (fin - debut)) + (fin - debut)) % (fin - debut);

  // Ne garde dans la piste et dans la bande que les vues de la galerie de l'image i.
  const choisir = (i) => {
    const g = data.photos[i].galerie;
    debut = -1;
    data.photos.forEach((p, j) => {
      const dedans = p.galerie === g;
      vues[j].hidden = !dedans;
      if (miniatures[j]) miniatures[j].hidden = !dedans;
      if (dedans && debut < 0) debut = j;
      if (dedans) fin = j + 1;
    });
  };

  // L'image d'une vue n'est demandée qu'à son approche.
  const charger = (i) => {
    const j = borner(i);
    const vue = vues[j];
    if (vue.dataset.charge) return;
    vue.dataset.charge = "1";
    const p = data.photos[j];
    if (p.fin) return;
    const source = vue.querySelector("source");
    const img = vue.querySelector("img");
    // Un plan se regarde de près : toujours sa plus grande version, qui reste légère.
    const sizes = p.plan ? "300vw" : "100vw";
    source.sizes = sizes;
    source.srcset = srcset(p, "avif");
    img.sizes = sizes;
    img.srcset = srcset(p, "webp");
    img.src = fichier(p, p.largeurs[p.largeurs.length - 1], "webp");
  };

  // Amène une miniature au milieu de la bande, sans faire défiler autre chose que la bande.
  const centrer = (b, doux) => {
    const x = bande.scrollLeft + b.getBoundingClientRect().left - bande.getBoundingClientRect().left - (bande.clientWidth - b.offsetWidth) / 2;
    if (doux && "scrollBehavior" in document.documentElement.style) bande.scrollTo({ left: x, behavior: "smooth" });
    else bande.scrollLeft = x;
  };

  function marquer(i, doux) {
    vues[courant].classList.remove("courante");
    courant = i;
    const p = data.photos[i];
    vues[i].classList.add("courante");
    legende.textContent = `${i - debut + 1} / ${fin - debut} · ${p.legende}`;
    charger(i - 1);
    charger(i);
    charger(i + 1);
    if (!p.fin && !photosVues.has(p.hs)) {
      photosVues.add(p.hs);
      envoyer({ t: "photo", n: p.hs });
    }
    miniatures.forEach((b, j) => {
      if (j === i) {
        b.setAttribute("aria-current", "true");
        centrer(b, doux);
      } else {
        b.removeAttribute("aria-current");
      }
    });
    // Le focus du clavier suit la miniature courante : resté sur une autre, son contour la ferait passer pour sélectionnée.
    if (document.activeElement !== miniatures[i] && miniatures.indexOf(document.activeElement) >= 0) miniatures[i].focus({ preventScroll: true });
  }

  // Défilement animé vers la vue voisine ; un saut plus long, ou le retour du bout de la piste à l'autre, est immédiat.
  function aller(i, doux) {
    const vers = borner(i);
    const voisine = Math.abs(vers - courant) === 1;
    marquer(vers, doux);
    const x = (vers - debut) * piste.clientWidth;
    clearTimeout(finCible);
    if (Math.abs(piste.scrollLeft - x) < 1) {
      cible = null;
      return;
    }
    cible = vers;
    finCible = setTimeout(() => { cible = null; }, 1200);
    if (doux && voisine && "scrollBehavior" in document.documentElement.style) piste.scrollTo({ left: x, behavior: "smooth" });
    else piste.scrollLeft = x;
  }

  // La vue la plus proche du centre devient la vue courante.
  piste.addEventListener("scroll", () => {
    if (!piste.clientWidth) return;
    const i = debut + Math.round(piste.scrollLeft / piste.clientWidth);
    if (cible !== null) {
      if (i === cible) cible = null;
      return;
    }
    if (i !== courant && i < fin) marquer(i, true);
  }, { passive: true });
  // Le doigt ou la molette reprennent la main sur un défilement demandé.
  ["touchstart", "wheel", "mousedown"].forEach((type) => piste.addEventListener(type, () => { cible = null; }, { passive: true }));
  window.addEventListener("resize", () => { if (dlg.open) piste.scrollLeft = (courant - debut) * piste.clientWidth; });

  function ouvrir(i) {
    // Sans <dialog> (Safari avant 15.4) : la photo seule, en JPEG ; le bouton retour ramène à la page.
    if (!dlg.showModal) {
      const p = data.photos[i];
      location.href = fichier(p, p.repli[p.repli.length - 1], "jpg");
      return;
    }
    choisir(i);
    if (!dlg.open) dlg.showModal();
    // showModal donne le focus au premier bouton, la première miniature : la visionneuse le reprend.
    dlg.focus();
    aller(i, false);
  }

  // Vignettes, bouton « Voir les photos » du haut de page, boutons « + n photos » : data-i donne l'image à ouvrir.
  document.querySelectorAll("main [data-i]").forEach((b) => b.addEventListener("click", () => ouvrir(Number(b.dataset.i))));
  miniatures.forEach((b) => b.addEventListener("click", () => aller(Number(b.dataset.i), true)));
  dlg.querySelector(".v-fermer").addEventListener("click", () => dlg.close());
  dlg.querySelector(".v-prec").addEventListener("click", () => aller(courant - 1, true));
  dlg.querySelector(".v-suiv").addEventListener("click", () => aller(courant + 1, true));
  dlg.addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    ev.preventDefault();
    aller(courant + (ev.key === "ArrowRight" ? 1 : -1), true);
  });
  // Un clic sur le fond (hors de l'image et des boutons) ferme la visionneuse.
  dlg.addEventListener("click", (ev) => {
    if (ev.target === dlg || ev.target === piste || ev.target.tagName === "FIGURE") dlg.close();
  });
})();
