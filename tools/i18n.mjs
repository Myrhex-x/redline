/**
 * ScanRecords localized editions.
 *
 * Each locale is a self-contained dictionary: status taxonomy, chrome
 * strings, and full page bodies for the five localized pages (checker home,
 * chat-control explainer, switch guide, alerts, glossary). Company detail
 * pages remain English — 30 sourced notes per language would rot.
 *
 * Adding a language = adding one entry here. The generator calls
 * emitLocales(ctx) with everything it needs (shell pieces, data, helpers).
 */

const PAGE_PATHS = {
  home: "", cc: "chat-control/", switch: "switch/", alerts: "alerts/", glossary: "glossary/",
};

export function pathsFor(key) {
  const suffix = PAGE_PATHS[key];
  return {
    en: "/" + suffix,
    fr: "/fr/" + suffix,
    de: "/de/" + suffix,
    es: "/es/" + suffix,
  };
}

export const LOCALES = {
  // ————————————————————————————————————————————————————————— FRANÇAIS ——
  fr: {
    htmlLang: "fr", name: "Français",
    ui: {
      skip: "Aller au contenu",
      nav: [["", "Vérifier", "home"], ["chat-control/", "Chat Control", "cc"], ["switch/", "Se protéger", "switch"], ["alerts/", "Alertes", "alerts"], ["glossary/", "Glossaire", "gloss"]],
      brand: "l'archive des politiques face au Chat Control.",
      brand2: "Relevé quotidien. Pas de cookies, pas de traceurs, pas de comptes — rien à consentir.",
      cols: ["Explorer", "Le registre", "Règles"],
      colExplore: [["", "Le vérificateur"], ["chat-control/", "C'est quoi, Chat Control ?"], ["switch/", "Se protéger"], ["glossary/", "Glossaire"]],
      colExploreEN: [["/numbers/", "Les chiffres (EN)"], ["/notes/", "Notes (EN)"]],
      colRecord: [["/companies/", "Entreprises suivies (EN)"], ["alerts/", "Alertes"], ["/data/", "Données CC0 (EN)"]],
      colRules: [["/about/", "Méthode (EN)"], ["/legal/", "Mentions légales"]],
      policyLabel: "Politique éditoriale",
      statusNote: (d, repo) => `Statuts évalués le ${d} à partir de sources publiques — <strong>ils décrivent ce que les entreprises déclarent et déposent, pas des mesures de leurs logiciels</strong>. Les fiches détaillées des entreprises sont en anglais. Un statut vous semble faux ? <a href="${repo}/issues">Contestez-le</a> — les contestations sont publiées.`,
    },
    status: {
      confirmed: { label: "Scanne sous le Chat Control de l'UE", verdict: "Scanne sous Chat Control — confirmé",
        blurb: "Les rapports obligatoires de la dérogation n'existent que pour les fournisseurs qui scannent réellement des communications privées. Exactement cinq les ont déposés, pour 2023 et 2024, selon le rapport de mise en œuvre de la Commission — c'est l'usage du Chat Control, documenté par l'UE elle-même." },
      global: { label: "Scanne mondialement — aucune preuve UE", verdict: "Scanne sous la loi américaine · aucune preuve UE",
        blurb: "Leurs documents révèlent un scan des contenus au titre du droit américain (signalements NCMEC, PhotoDNA). Aucune preuve qu'ils invoquent la dérogation européenne pour les communications privées — le scan « loi US » et le Chat Control sont deux régimes distincts." },
      unclear: { label: "Aucune déclaration claire", verdict: "Ne se prononce pas",
        blurb: "Pas de chiffrement de bout en bout, et aucune déclaration publique claire, dans un sens ou dans l'autre, sur le scan des communications privées." },
      denies: { label: "Affirme ne pas scanner", verdict: "Affirme ne pas scanner",
        blurb: "L'entreprise déclare publiquement ne pas scanner le contenu des messages." },
      e2ee: { label: "Chiffré de bout en bout — hors champ", verdict: "Ne peut pas lire vos messages",
        blurb: "Le contenu est chiffré de bout en bout ; les communications E2EE sont formellement exclues du scan volontaire du Chat Control." },
    },
    home: {
      title: "ScanRecords — votre appli scanne-t-elle vos messages sous le Chat Control ?",
      desc: "Vérifiez ce que les documents de votre messagerie disent du Chat Control européen — relevé quotidien, chaque changement conservé avec l'avant et l'après.",
      eyebrow: "Un registre public — mis à jour chaque jour à 06 h 17 UTC",
      h1: "Votre messagerie scanne-t-elle vos messages sous le Chat&nbsp;Control&nbsp;?",
      lede: (n) => `Le Chat Control, c'est la règle européenne qui permet aux fournisseurs de <strong>scanner volontairement les messages privés</strong> jusqu'en avril 2028. Chaque entreprise décide pour elle-même — et les applications chiffrées de bout en bout sont exclues. Trouvez la vôtre ci-dessous : les statuts suivent la preuve la plus solide disponible. <a href="/fr/chat-control/">Comment ça marche →</a>`,
      barAria: (n) => `Sur ${n} plateformes suivies`,
      bignums: ["scannent sous Chat Control", "scannent sous la loi US", "ne se prononcent pas", "affirme ne pas scanner", "ne peuvent pas — E2EE"],
      how: "Comment fonctionne le registre",
      steps: [["1 · Relevé", "Chaque politique, page sécurité et fiche App Store suivie est re-consultée tous les jours à 06 h 17 UTC."], ["2 · Différence", "Un changement n'est enregistré que si les mots ont réellement changé — avec l'avant et l'après conservés."], ["3 · Témoin", "Chaque relevé est un commit git public, et Internet Archive capture les pages modifiées le jour même."]],
      deeper: "Aller plus loin",
      cards: [["fr/chat-control/", "C'est quoi, le Chat Control ? →", "Le guide en clair : la chronologie, 1.0 contre 2.0, qui scanne vraiment, et ce que ça change pour vos applis."], ["fr/switch/", "Échapper au scan →", "La version pratique : quelles applis ne peuvent pas lire vos messages, le piège des sauvegardes, et pourquoi un VPN n'y change rien."], ["fr/alerts/", "Recevoir les alertes →", "Une notification dès qu'une entreprise suivie bouge. Sans compte, sans e-mail."], ["numbers/", "Leurs propres chiffres (EN) →", "Taux d'erreur, volumes, et l'effet du chiffrement — d'après le rapport de la Commission."]],
      trust: [["Pas de cookies,", " pas de traceurs — du JavaScript uniquement sur la page d'alertes, en opt-in"], ["Chaque relevé", " est un commit git public — infalsifiable"], ["Chaque statut cite ses preuves", " et peut être contesté publiquement"], ["Les données sont CC0", ` — <a href="/data/">réutilisez-les</a>`]],
    },
    cc: {
      title: "C'est quoi, le Chat Control ? — guide en clair — ScanRecords",
      desc: "Le Chat Control expliqué : le scan volontaire en vigueur jusqu'en avril 2028, la chronologie, 1.0 contre 2.0, qui scanne vraiment selon le rapport de la Commission, et ce que ça change pour vos applis.",
      body: (x) => `
  <section class="hero cc-hero"><div class="beam" aria-hidden="true"></div><div class="cc-grid"><div>
    <div class="eyebrow">Règlement (UE) 2021/1232 — en vigueur jusqu'en avril 2028</div>
    <h1>C'est quoi, le Chat&nbsp;Control&nbsp;?</h1>
    <p class="lede">La règle qui permet aux fournisseurs de messageries de <strong>scanner volontairement les messages privés</strong> dans l'UE. Ni obligatoire, ni universel — et les applications chiffrées de bout en bout sont exclues. Voici la version en clair, avec les sources primaires.</p>
  </div><div class="cc-eye">${x.EYE_SVG}</div></div></section>
  <div class="about">
  <h2>Ce que c'est</h2>
  <p>En droit européen, lire des communications privées est normalement interdit — y compris pour les fournisseurs. La dérogation ePrivacy (règlement 2021/1232, surnommé <strong>« Chat Control 1.0 »</strong>) crée une exception : les fournisseurs <em>peuvent</em> scanner les messages privés à la recherche de contenus pédocriminels, s'ils le choisissent. Expirée en avril 2026, rétablie par le Conseil et maintenue après un vote de rejet manqué au Parlement en juillet 2026, elle court jusqu'en <strong>avril 2028</strong>. Un amendement adopté en parallèle <strong>exclut formellement les communications chiffrées de bout en bout</strong>.</p>
  <p>Un règlement séparé et permanent (le règlement CSA, <strong>« Chat Control 2.0 »</strong>), qui pourrait rendre la détection obligatoire — y compris sur les applis chiffrées, via un scan sur votre appareil avant le chiffrement — reste en négociation. Ce n'est pas la loi.</p>
  <h2>La chronologie</h2>
  <ol class="tl">
    <li><b>Déc. 2020</b> — Les règles télécoms étendent ePrivacy aux messageries ; Facebook suspend son scan dans l'UE du jour au lendemain.</li>
    <li><b>Juil. 2021</b> — Le règlement 2021/1232 entre en vigueur : le scan volontaire redevient légal. Chat Control 1.0.</li>
    <li><b>Août 2021</b> — Apple annonce un scan des photos sur l'appareil ; abandon fin 2022.</li>
    <li><b>Mai 2022</b> — La Commission propose le règlement CSA permanent. Chat Control 2.0.</li>
    <li><b>Nov. 2023</b> — Position du Parlement : pas de scan généralisé, protéger le chiffrement.</li>
    <li><b>Déc. 2023</b> — Meta active l'E2EE par défaut sur Messenger.</li>
    <li><b>Juin 2024</b> — Le compromis « modération à l'upload » du Conseil échoue.</li>
    <li><b>Déc. 2025</b> — Début des trilogues sur le 2.0.</li>
    <li><b>Mars–avril 2026</b> — Le Parlement rejette la prolongation du 1.0 (311–228) ; expiration le 3 avril.</li>
    <li><b>Juil. 2026</b> — Le Conseil la rétablit ; la motion de rejet (314–276) rate la majorité absolue de 361. Prolongée jusqu'en <b>avril 2028</b>, E2EE exclu.</li>
    <li><b>Juin–juil. 2026</b> — Le trilogue « final » sur le 2.0 s'effondre sur le scan sans soupçon.</li>
  </ol>
  <h2>1.0 contre 2.0 — ne les confondez pas</h2>
  <div class="scroll"><table class="cmp">
    <thead><tr><th></th><th>Chat Control 1.0 (en vigueur)</th><th>Chat Control 2.0 (projet)</th></tr></thead>
    <tbody>
    <tr><td class="dim">Nature</td><td>Dérogation ePrivacy — règlement 2021/1232</td><td>Règlement CSA — proposé en 2022, en négociation</td></tr>
    <tr><td class="dim">Scan</td><td><strong>Volontaire</strong> — chaque fournisseur décide</td><td>Pourrait devenir <strong>obligatoire</strong></td></tr>
    <tr><td class="dim">Applis chiffrées</td><td><strong>Formellement exclues</strong></td><td>Le cœur du conflit — le scan côté client les toucherait</td></tr>
    <tr><td class="dim">Échéance</td><td>Avril 2028</td><td>Pas une loi ; rien à expirer</td></tr>
    </tbody></table></div>
  <div class="banner st-unclear" style="margin-top:1.4rem"><strong>Où en est le 2.0</strong> <span class="dim">— relu le ${x.assessed}</span>
    <div style="margin-top:.45rem" class="dim">Le trilogue censément final s'est effondré le 29 juin 2026 sur le scan sans soupçon ; les négociations continuent sous présidence irlandaise. Rien n'est encore la loi.</div></div>
  <h2>Qui l'utilise vraiment</h2>
  <p>Les fournisseurs qui scannent sous la dérogation déposent des rapports annuels, et le dernier rapport de la Commission en nomme exactement cinq : <em>« Google, LinkedIn, Meta, Microsoft and Yubo submitted reports, for both 2023 and 2024 »</em> (<a href="https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A52025DC0740">COM(2025)&nbsp;740</a>). Le suivi de l'eurodéputé <a href="https://www.patrick-breyer.de/en/posts/chat-control/">Patrick Breyer</a> ajoute que seuls des services américains non chiffrés y ont recours. Snapchat et Apple figurent dans sa liste mais <strong>pas</strong> parmi les cinq déposants — les deux faits sont affichés sur leurs fiches.</p>
  <h2>Scanner sous la loi américaine n'est pas le Chat Control</h2>
  <p>La plupart des grandes plateformes américaines scannent les contenus envoyés et signalent au <a href="https://www.missingkids.org/cybertiplinedata">NCMEC</a> — un <strong>régime juridique américain</strong>, qui ne dit rien de l'usage de la dérogation européenne. Point rouge plein = preuve UE ; point creux = scan « loi US » sans preuve UE. Les confondre gonflerait le registre.</p>
  <h2>Ce que ça change pour vous</h2>
  <ul>
    <li><strong>Gmail, la messagerie de Facebook ou d'Instagram, Outlook, LinkedIn dans l'UE</strong> — le fournisseur scanne sous la dérogation, légalement et par choix. Un scan automatisé, pas une personne qui lit — mais c'est bien votre correspondance privée qui est traitée.</li>
    <li><strong>Signal, WhatsApp, Threema, Olvid, Wire, Element</strong> — contenu chiffré de bout en bout ; rien de lisible à scanner.</li>
    <li><strong>Un VPN n'y change rien</strong> — le scan a lieu chez le fournisseur, pas sur le réseau.</li>
    <li><strong>Telegram est un cas à part</strong> — les tchats cloud ne sont pas E2EE ; Telegram <em>pourrait</em> les lire, et ne dit pas s'il les scanne.</li>
  </ul>
  <h2>Les cinq statuts</h2>
  <ul>${x.statusList}</ul>
  <h2>Questions fréquentes</h2>
  <details><summary>Quelqu'un lit-il mes messages WhatsApp ou Signal ?</summary><p>Pas sous le Chat Control 1.0. Chiffrés de bout en bout, formellement exclus. Le point de pression, c'est le <em>projet</em> 2.0 — qui n'est pas la loi.</p></details>
  <details><summary>Le Chat Control, c'est ce qui casserait le chiffrement ?</summary><p>Ça, c'est le 2.0 — dont les ordres de détection pourraient imposer un scan sur votre appareil, avant le chiffrement. Bloqué en négociation depuis 2022. Le 1.0, en vigueur, exclut l'E2EE.</p></details>
  <details><summary>Puis-je refuser le scan actuel ?</summary><p>Uniquement par le choix de l'application : un service chiffré de bout en bout — voir <a href="/fr/#e2ee">les applis qui ne peuvent pas lire vos messages</a>.</p></details>
  <details><summary>Pourquoi « aucune preuve UE » plutôt que « ne scanne pas dans l'UE » ?</summary><p>Parce que l'absence de preuve est exactement ce que nous avons. Nous publions la phrase vraie la plus forte, pas la phrase la plus forte.</p></details>
  <h2>Sources</h2>
  <ul class="sources">
    <li><a href="https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A52025DC0740">COM(2025) 740</a> — le rapport de mise en œuvre : les cinq déposants, volumes, taux d'erreur.</li>
    <li><a href="https://www.patrick-breyer.de/en/posts/chat-control/">La page Chat Control de Patrick Breyer</a>.</li>
    <li><a href="https://fightchatcontrol.eu/">fightchatcontrol.eu</a> — positions pays par pays.</li>
    <li><a href="https://edri.org/our-work/csa-regulation-document-pool/">Le dossier documentaire d'EDRi</a>.</li>
  </ul></div>`,
    },
    switch: {
      title: "Échapper concrètement au scan — ScanRecords",
      desc: "La version pratique : quelles applis ne peuvent pas lire vos messages, le piège des sauvegardes WhatsApp, pourquoi un VPN n'y change rien, et ce qui fuit quand même.",
      body: (x) => `<div class="about">
  <h1>Échapper concrètement au scan</h1>
  <p class="lede">Tout découle du registre : ce qui est scanné aujourd'hui, ce qui ne peut pas l'être, et les réglages qui annulent discrètement votre protection. Rien à acheter — des choix.</p>
  <h2>1. Le seul vrai opt-out, c'est l'application</h2>
  <p>Le scan du Chat Control a lieu <strong>chez le fournisseur</strong>. Les applis chiffrées de bout en bout n'ont rien de lisible à scanner et sont formellement exclues :</p>
  ${x.e2eeCards}
  <h2>2. Le piège des sauvegardes</h2>
  <p>Les conversations WhatsApp sont chiffrées — mais une <strong>sauvegarde cloud non chiffrée</strong> en remet une copie lisible aux serveurs d'Apple ou de Google. Désactivez-la, ou activez la <em>sauvegarde chiffrée de bout en bout</em> (Réglages → Discussions → Sauvegarde).</p>
  <h2>3. L'e-mail, c'est la zone scannée</h2>
  <p>Gmail et Outlook sont scannés dans l'UE sous la dérogation. Proton déclare ne pas scanner le contenu ; GMX ne se prononce pas. Le choix du fournisseur pèse plus que n'importe quel réglage.</p>
  <h2>4. Un VPN ne protège pas de ça</h2>
  <p>Un VPN déplace votre trafic, pas vos messages — le scan se produit là où le message est traité. Choisissez l'appli, pas le tunnel.</p>
  <h2>5. Sachez ce qui fuit quand même</h2>
  <p>L'E2EE protège le <strong>contenu</strong>. Les métadonnées — qui, quand, à quelle fréquence — restent visibles chez la plupart des fournisseurs (Signal et Threema les minimisent). Et rien ne protège un téléphone déverrouillé par quelqu'un d'autre.</p>
  <h2>6. Ce que cette page ne couvre pas</h2>
  <p>Le projet <a href="/fr/chat-control/">Chat Control 2.0</a> pourrait atteindre les applis chiffrées via un scan sur l'appareil — c'est pourquoi cette archive surveille chaque jour la phrase « nous ne pouvons pas lire vos messages ».</p>
  <p class="note" style="margin-top:1.6rem">Envoyez cette page à la personne qui vous a demandé « bon, et je fais quoi ? »</p></div>`,
    },
    alerts: {
      title: "Alertes — ScanRecords",
      desc: "Une notification dès qu'une entreprise suivie modifie une politique ou une fiche sous le Chat Control. Sans compte, sans e-mail — se désinscrire efface tout.",
      body: () => `
  <h1>Une alerte dès qu'une entreprise bouge</h1>
  <p class="lede">Dès qu'une entreprise suivie modifie une politique, une promesse de chiffrement ou une fiche App Store, votre téléphone peut le savoir. Gratuit, sans compte, sans e-mail — seul le point de terminaison push de votre navigateur est stocké, et se désinscrire l'efface.</p>
  <div class="banner st-e2ee" style="margin-top:1.6rem"><strong>Sur iPhone ou Android, installez d'abord le site</strong>
    <div style="margin-top:.45rem" class="dim"><strong>iPhone :</strong> Partager → <em>Sur l'écran d'accueil</em>, puis ouvrez ScanRecords depuis l'écran d'accueil et abonnez-vous (iOS 16.4+).<br><strong>Android :</strong> menu Chrome → <em>Ajouter à l'écran d'accueil</em> — ou abonnez-vous directement.</div></div>
  <p style="margin-top:1.4rem"><button id="subscribe" class="btn">Activer les alertes sur cet appareil</button><button id="unsubscribe" class="btn" hidden>Désactiver les alertes</button></p>
  <p id="alert-status" class="note" aria-live="polite"></p>
  <h2>Ce qui déclenche une notification</h2>
  <ul class="about" style="padding-left:1.2rem"><li>Une entreprise suivie a modifié une politique, des conditions, une page sécurité ou sa fiche App Store — avec le lien vers l'avant/après exact.</li><li>Rien d'autre. La plupart des jours : le silence — c'est le but.</li></ul>
  <h2>La boîte d'honnêteté</h2>
  <p class="note">La seule page du site avec du JavaScript, et seulement après votre clic. S'abonner stocke le point de terminaison push — une URL aléatoire — et ses deux clés. Pas de cookies, pas d'e-mail. Se désinscrire efface tout. Zéro script ? Le <a href="/feed.xml">flux RSS</a> porte les mêmes alertes (messages d'état en anglais).</p>
  <script src="/alerts.js" defer></script>`,
    },
    glossary: {
      title: "Glossaire — ScanRecords",
      desc: "Le vocabulaire du Chat Control en langage clair : E2EE, scan côté client, correspondance d'empreintes, ordres de détection, et plus.",
      h1: "Glossaire",
      lede: "Douze termes qui portent l'essentiel des débats sur le Chat Control — chacun en langage clair.",
      terms: [
        ["Chat Control", "Le surnom de deux textes européens : la dérogation ePrivacy en vigueur (« 1.0 », scan volontaire, jusqu'en avril 2028) et le projet de règlement CSA (« 2.0 », détection potentiellement obligatoire). L'essentiel de la confusion vient de leur mélange."],
        ["Dérogation ePrivacy (règlement 2021/1232)", "L'exception aux règles européennes de confidentialité qui permet aux fournisseurs de scanner volontairement les communications privées. En vigueur jusqu'en avril 2028 ; l'E2EE en est formellement exclu."],
        ["Règlement CSA (« Chat Control 2.0 »)", "Le règlement permanent proposé en 2022, dont les ordres de détection pourraient rendre le scan obligatoire, y compris sur l'appareil. En négociation ; pas une loi."],
        ["Chiffrement de bout en bout (E2EE)", "Seuls les appareils qui communiquent détiennent les clés — le fournisseur ne peut pas lire le contenu. Signal, WhatsApp, Threema, Olvid, Wire et Element l'activent par défaut."],
        ["Scan côté client", "Scanner le contenu sur l'appareil, avant le chiffrement. Le mécanisme par lequel une détection obligatoire atteindrait les applis E2EE."],
        ["Correspondance d'empreintes", "Comparer l'empreinte d'une image à une base de contenus illégaux connus. Ne détecte que du contenu déjà identifié."],
        ["PhotoDNA", "La technologie d'empreintes perceptuelles de Microsoft (2009), utilisée dans toute l'industrie."],
        ["Classifieur", "Un modèle d'apprentissage qui signale des contenus jamais vus. Détecte du nouveau matériel, avec plus de faux positifs."],
        ["NCMEC / CyberTipline", "Le canal de signalement américain. La loi américaine impose d'y signaler — un régime distinct de la dérogation européenne."],
        ["Ordre de détection", "Dans le projet 2.0, une injonction imposant à un service de scanner. Ce qui ferait passer le scan de volontaire à obligatoire."],
        ["Trilogue", "La négociation à huis clos entre Conseil, Parlement et Commission. Celui du 2.0 s'est effondré en juin 2026."],
        ["Métadonnées", "Qui parle à qui, quand, d'où. Hors E2EE et hors scan — mais assez révélatrices pour mériter leur propre vigilance."],
      ],
    },
  },

  // ————————————————————————————————————————————————————————— DEUTSCH ——
  de: {
    htmlLang: "de", name: "Deutsch",
    ui: {
      skip: "Zum Inhalt springen",
      nav: [["", "Prüfen", "home"], ["chat-control/", "Chatkontrolle", "cc"], ["switch/", "Schützen", "switch"], ["alerts/", "Alarme", "alerts"], ["glossary/", "Glossar", "gloss"]],
      brand: "das Archiv der Richtlinien zur Chatkontrolle.",
      brand2: "Täglich erfasst. Keine Cookies, kein Tracking, keine Konten — nichts, dem man zustimmen müsste.",
      cols: ["Entdecken", "Das Register", "Regeln"],
      colExplore: [["", "Der Check"], ["chat-control/", "Was ist die Chatkontrolle?"], ["switch/", "Sich schützen"], ["glossary/", "Glossar"]],
      colExploreEN: [["/numbers/", "Die Zahlen (EN)"], ["/notes/", "Notizen (EN)"]],
      colRecord: [["/companies/", "Erfasste Unternehmen (EN)"], ["alerts/", "Alarme"], ["/data/", "Daten CC0 (EN)"]],
      colRules: [["/about/", "Methode (EN)"], ["/legal/", "Impressum & Datenschutz"]],
      policyLabel: "Redaktionsrichtlinie",
      statusNote: (d, repo) => `Status bewertet am ${d} auf Basis öffentlicher Quellen — <strong>sie beschreiben, was Unternehmen erklären und einreichen, keine Messungen ihrer Software</strong>. Die Detailseiten der Unternehmen sind auf Englisch. Ein Status erscheint Ihnen falsch? <a href="${repo}/issues">Widersprechen Sie</a> — Einwände werden veröffentlicht.`,
    },
    status: {
      confirmed: { label: "Scannt unter der EU-Chatkontrolle", verdict: "Scannt unter der Chatkontrolle — belegt",
        blurb: "Die Pflichtberichte der Ausnahmeregelung existieren nur für Anbieter, die tatsächlich private Kommunikation scannen. Genau fünf haben sie eingereicht, für 2023 und 2024, laut Umsetzungsbericht der Kommission — Chatkontrolle in Gebrauch, von der EU selbst dokumentiert." },
      global: { label: "Scannt weltweit — kein EU-Nachweis", verdict: "Scannt nach US-Recht · kein EU-Nachweis",
        blurb: "Ihre Dokumente belegen Inhalts-Scans nach US-Recht (NCMEC-Meldungen, PhotoDNA). Kein Nachweis, dass sie die EU-Ausnahmeregelung für private Kommunikation nutzen — US-Scans und Chatkontrolle sind getrennte Regime." },
      unclear: { label: "Keine klare Aussage", verdict: "Äußert sich nicht",
        blurb: "Nicht Ende-zu-Ende-verschlüsselt, und keine klare öffentliche Aussage — in keine Richtung — zum Scannen privater Kommunikation." },
      denies: { label: "Erklärt, nicht zu scannen", verdict: "Erklärt, nicht zu scannen",
        blurb: "Das Unternehmen erklärt öffentlich, Nachrichteninhalte nicht zu scannen." },
      e2ee: { label: "Ende-zu-Ende-verschlüsselt — außen vor", verdict: "Kann Ihre Nachrichten nicht lesen",
        blurb: "Inhalte sind Ende-zu-Ende-verschlüsselt; E2EE-Kommunikation ist vom freiwilligen Scannen der Chatkontrolle formell ausgenommen." },
    },
    home: {
      title: "ScanRecords — scannt Ihre App Ihre Nachrichten unter der EU-Chatkontrolle?",
      desc: "Prüfen Sie, was die Dokumente Ihres Messengers zur EU-Chatkontrolle sagen — täglich erfasst, jede Änderung mit Vorher und Nachher bewahrt.",
      eyebrow: "Ein öffentliches Register — täglich aktualisiert um 06:17 UTC",
      h1: "Scannt Ihre Messaging-App Ihre Nachrichten unter der Chatkontrolle?",
      lede: (n) => `Die Chatkontrolle ist die EU-Regel, die Anbietern erlaubt, <strong>private Nachrichten freiwillig zu scannen</strong> — bis April 2028. Jedes Unternehmen entscheidet selbst, und Ende-zu-Ende-verschlüsselte Apps sind ausgenommen. Finden Sie Ihre App unten: Die Status folgen dem stärksten verfügbaren Beleg. <a href="/de/chat-control/">Wie das funktioniert →</a>`,
      barAria: (n) => `Von ${n} erfassten Plattformen`,
      bignums: ["scannen unter der Chatkontrolle", "scannen nach US-Recht", "äußern sich nicht", "erklärt, nicht zu scannen", "können nicht — E2EE"],
      how: "Wie das Register arbeitet",
      steps: [["1 · Erfassen", "Jede erfasste Richtlinie, Sicherheitsseite und App-Store-Angabe wird täglich um 06:17 UTC neu abgerufen."], ["2 · Vergleichen", "Eine Änderung wird nur festgehalten, wenn sich die Worte wirklich geändert haben — mit bewahrtem Vorher und Nachher."], ["3 · Bezeugen", "Jede Erfassung ist ein öffentlicher Git-Commit, und das Internet Archive sichert geänderte Quellen am selben Tag."]],
      deeper: "Tiefer einsteigen",
      cards: [["de/chat-control/", "Was ist die Chatkontrolle? →", "Der Klartext-Leitfaden: die Chronik, 1.0 gegen 2.0, wer wirklich scannt, und was das für Ihre Apps heißt."], ["de/switch/", "Dem Scannen entkommen →", "Die praktische Seite: welche Apps Ihre Nachrichten nicht lesen können, die Backup-Falle, und warum ein VPN nichts ändert."], ["de/alerts/", "Alarme erhalten →", "Eine Benachrichtigung, sobald sich ein erfasstes Unternehmen bewegt. Ohne Konto, ohne E-Mail."], ["numbers/", "Ihre eigenen Zahlen (EN) →", "Fehlerquoten, Volumina und der Verschlüsselungseffekt — aus dem Bericht der Kommission."]],
      trust: [["Keine Cookies,", " kein Tracking — JavaScript nur auf der Alarm-Seite, per Opt-in"], ["Jede Erfassung", " ist ein öffentlicher Git-Commit — fälschungssicher"], ["Jeder Status nennt seine Belege", " und kann öffentlich angefochten werden"], ["Die Daten sind CC0", ` — <a href="/data/">nutzen Sie sie</a>`]],
    },
    cc: {
      title: "Was ist die Chatkontrolle? — Klartext-Leitfaden — ScanRecords",
      desc: "Die Chatkontrolle erklärt: das freiwillige Scannen bis April 2028, die Chronik, 1.0 gegen 2.0, wer laut Kommissionsbericht wirklich scannt, und was das für Ihre Apps heißt.",
      body: (x) => `
  <section class="hero cc-hero"><div class="beam" aria-hidden="true"></div><div class="cc-grid"><div>
    <div class="eyebrow">Verordnung (EU) 2021/1232 — in Kraft bis April 2028</div>
    <h1>Was ist die Chatkontrolle?</h1>
    <p class="lede">Die Regel, die Messaging-Anbietern erlaubt, <strong>private Nachrichten in der EU freiwillig zu scannen</strong>. Weder verpflichtend noch flächendeckend — und Ende-zu-Ende-verschlüsselte Apps sind ausgenommen. Hier die Klartext-Fassung, mit Primärquellen.</p>
  </div><div class="cc-eye">${x.EYE_SVG}</div></div></section>
  <div class="about">
  <h2>Worum es geht</h2>
  <p>Nach EU-Recht ist das Mitlesen privater Kommunikation grundsätzlich verboten — auch für Anbieter. Die ePrivacy-Ausnahme (Verordnung 2021/1232, bekannt als <strong>„Chatkontrolle 1.0“</strong>) schafft eine Ausnahme: Anbieter <em>dürfen</em> private Nachrichten nach Darstellungen sexuellen Kindesmissbrauchs durchsuchen, wenn sie das wollen. Im April 2026 ausgelaufen, vom Rat wiederhergestellt und nach einer gescheiterten Ablehnung im Parlament im Juli 2026 verlängert, gilt sie bis <strong>April 2028</strong>. Ein parallel beschlossener Änderungsantrag <strong>nimmt Ende-zu-Ende-verschlüsselte Kommunikation formell aus</strong>.</p>
  <p>Eine separate, dauerhafte Verordnung (die CSA-Verordnung, <strong>„Chatkontrolle 2.0“</strong>), die Erkennung verpflichtend machen könnte — auch auf verschlüsselten Apps, per Scan auf Ihrem Gerät vor der Verschlüsselung — wird weiter verhandelt. Sie ist kein Gesetz.</p>
  <h2>Die Chronik</h2>
  <ol class="tl">
    <li><b>Dez. 2020</b> — Neue Telekom-Regeln erstrecken ePrivacy auf Messenger; Facebook stoppt sein EU-Scanning über Nacht.</li>
    <li><b>Juli 2021</b> — Verordnung 2021/1232 tritt in Kraft: freiwilliges Scannen wird wieder legal. Chatkontrolle 1.0.</li>
    <li><b>Aug. 2021</b> — Apple kündigt Foto-Scans auf dem Gerät an; Ende 2022 aufgegeben.</li>
    <li><b>Mai 2022</b> — Die Kommission schlägt die dauerhafte CSA-Verordnung vor. Chatkontrolle 2.0.</li>
    <li><b>Nov. 2023</b> — Position des Parlaments: kein anlassloses Scannen, Verschlüsselung schützen.</li>
    <li><b>Dez. 2023</b> — Meta aktiviert E2EE standardmäßig im Messenger.</li>
    <li><b>Juni 2024</b> — Der „Upload-Moderation“-Kompromiss des Rats scheitert.</li>
    <li><b>Dez. 2025</b> — Beginn der Triloge zur 2.0.</li>
    <li><b>März–April 2026</b> — Das Parlament lehnt die Verlängerung der 1.0 ab (311–228); Auslaufen am 3. April.</li>
    <li><b>Juli 2026</b> — Der Rat stellt sie wieder her; der Ablehnungsantrag (314–276) verfehlt die absolute Mehrheit von 361. Verlängert bis <b>April 2028</b>, E2EE ausgenommen.</li>
    <li><b>Juni–Juli 2026</b> — Der vermeintlich finale Trilog zur 2.0 scheitert am anlasslosen Scannen.</li>
  </ol>
  <h2>1.0 gegen 2.0 — nicht verwechseln</h2>
  <div class="scroll"><table class="cmp">
    <thead><tr><th></th><th>Chatkontrolle 1.0 (in Kraft)</th><th>Chatkontrolle 2.0 (Entwurf)</th></tr></thead>
    <tbody>
    <tr><td class="dim">Wesen</td><td>ePrivacy-Ausnahme — Verordnung 2021/1232</td><td>CSA-Verordnung — 2022 vorgeschlagen, in Verhandlung</td></tr>
    <tr><td class="dim">Scannen</td><td><strong>Freiwillig</strong> — jeder Anbieter entscheidet</td><td>Könnte per Anordnung <strong>verpflichtend</strong> werden</td></tr>
    <tr><td class="dim">Verschlüsselte Apps</td><td><strong>Formell ausgenommen</strong></td><td>Der Kern des Konflikts — Client-Side-Scanning träfe sie</td></tr>
    <tr><td class="dim">Frist</td><td>April 2028</td><td>Kein Gesetz; nichts läuft aus</td></tr>
    </tbody></table></div>
  <div class="banner st-unclear" style="margin-top:1.4rem"><strong>Wo die 2.0 steht</strong> <span class="dim">— geprüft am ${x.assessed}</span>
    <div style="margin-top:.45rem" class="dim">Der vermeintlich finale Trilog scheiterte am 29. Juni 2026 am anlasslosen Scannen; die Verhandlungen laufen unter irischer Ratspräsidentschaft weiter. Nichts davon ist Gesetz.</div></div>
  <h2>Wer sie wirklich nutzt</h2>
  <p>Anbieter, die unter der Ausnahme scannen, müssen jährlich berichten — und der jüngste Umsetzungsbericht der Kommission nennt genau fünf: <em>„Google, LinkedIn, Meta, Microsoft and Yubo submitted reports, for both 2023 and 2024“</em> (<a href="https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A52025DC0740">COM(2025)&nbsp;740</a>). Das Monitoring des Abgeordneten <a href="https://www.patrick-breyer.de/posts/chatkontrolle/">Patrick Breyer</a> ergänzt, dass nur unverschlüsselte US-Dienste davon Gebrauch machen. Snapchat und Apple stehen auf seiner Liste, aber <strong>nicht</strong> unter den fünf Berichterstattern — beide Fakten stehen auf ihren Seiten.</p>
  <h2>Scannen nach US-Recht ist keine Chatkontrolle</h2>
  <p>Die meisten großen US-Plattformen scannen Uploads und melden an das <a href="https://www.missingkids.org/cybertiplinedata">NCMEC</a> — ein <strong>US-Rechtsregime</strong>, das nichts über die Nutzung der EU-Ausnahme aussagt. Voller roter Punkt = EU-Beleg; hohler Punkt = US-Scans ohne EU-Beleg. Beides zu vermischen würde das Register aufblähen.</p>
  <h2>Was das für Sie heißt</h2>
  <ul>
    <li><strong>Gmail, Facebook- oder Instagram-Nachrichten, Outlook, LinkedIn in der EU</strong> — der Anbieter scannt unter der Ausnahme, legal und aus eigener Entscheidung. Automatisiert, kein Mensch, der mitliest — aber es ist Ihre private Korrespondenz, die verarbeitet wird.</li>
    <li><strong>Signal, WhatsApp, Threema, Olvid, Wire, Element</strong> — Ende-zu-Ende-verschlüsselt; nichts Lesbares zu scannen.</li>
    <li><strong>Ein VPN ändert daran nichts</strong> — gescannt wird beim Anbieter, nicht auf dem Netzwerkweg.</li>
    <li><strong>Telegram ist ein Sonderfall</strong> — Cloud-Chats sind nicht E2EE; Telegram <em>könnte</em> sie lesen und sagt nicht, ob es sie scannt.</li>
  </ul>
  <h2>Die fünf Status</h2>
  <ul>${x.statusList}</ul>
  <h2>Häufige Fragen</h2>
  <details><summary>Liest jemand meine WhatsApp- oder Signal-Nachrichten?</summary><p>Nicht unter der Chatkontrolle 1.0. Beide sind Ende-zu-Ende-verschlüsselt und formell ausgenommen. Der Druckpunkt ist der <em>Entwurf</em> 2.0 — der kein Gesetz ist.</p></details>
  <details><summary>Ist die Chatkontrolle das, was Verschlüsselung brechen würde?</summary><p>Das ist die 2.0 — deren Aufdeckungsanordnungen einen Scan auf Ihrem Gerät erzwingen könnten, vor der Verschlüsselung. Seit 2022 in der Verhandlung festgefahren. Die geltende 1.0 nimmt E2EE aus.</p></details>
  <details><summary>Kann ich dem heutigen Scannen widersprechen?</summary><p>Nur durch die Wahl der App: ein Ende-zu-Ende-verschlüsselter Dienst — siehe <a href="/de/#e2ee">die Apps, die Ihre Nachrichten nicht lesen können</a>.</p></details>
  <details><summary>Warum „kein EU-Nachweis“ statt „scannt nicht in der EU“?</summary><p>Weil das Fehlen von Belegen genau das ist, was wir haben. Wir veröffentlichen den stärksten wahren Satz, nicht den stärksten Satz.</p></details>
  <h2>Quellen</h2>
  <ul class="sources">
    <li><a href="https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A52025DC0740">COM(2025) 740</a> — der Umsetzungsbericht: die fünf Berichterstatter, Volumina, Fehlerquoten.</li>
    <li><a href="https://www.patrick-breyer.de/posts/chatkontrolle/">Patrick Breyers Chatkontrolle-Seite</a>.</li>
    <li><a href="https://fightchatcontrol.eu/">fightchatcontrol.eu</a> — Positionen Land für Land.</li>
    <li><a href="https://edri.org/our-work/csa-regulation-document-pool/">EDRis Dokumentensammlung</a>.</li>
  </ul></div>`,
    },
    switch: {
      title: "Dem Scannen konkret entkommen — ScanRecords",
      desc: "Die praktische Seite: welche Apps Ihre Nachrichten nicht lesen können, die WhatsApp-Backup-Falle, warum ein VPN nichts ändert, und was trotzdem sichtbar bleibt.",
      body: (x) => `<div class="about">
  <h1>Dem Scannen konkret entkommen</h1>
  <p class="lede">Alles hier folgt aus dem Register: was heute gescannt wird, was nicht gescannt werden kann, und welche Einstellungen Ihren Schutz stillschweigend aushebeln. Nichts zu kaufen — Entscheidungen.</p>
  <h2>1. Der einzige echte Ausweg ist die App</h2>
  <p>Das Scannen der Chatkontrolle passiert <strong>beim Anbieter</strong>. Ende-zu-Ende-verschlüsselte Apps haben nichts Lesbares zu scannen und sind formell ausgenommen:</p>
  ${x.e2eeCards}
  <h2>2. Die Backup-Falle</h2>
  <p>WhatsApp-Chats sind verschlüsselt — aber ein <strong>unverschlüsseltes Cloud-Backup</strong> legt trotzdem eine lesbare Kopie auf Apples oder Googles Server. Deaktivieren Sie das Chat-Backup, oder aktivieren Sie das <em>Ende-zu-Ende-verschlüsselte Backup</em> (Einstellungen → Chats → Chat-Backup).</p>
  <h2>3. E-Mail ist die gescannte Zone</h2>
  <p>Gmail und Outlook werden in der EU unter der Ausnahme gescannt. Proton erklärt, Inhalte nicht zu scannen; GMX äußert sich nicht klar. Bei sensibler Korrespondenz wiegt die Anbieterwahl schwerer als jede Einstellung.</p>
  <h2>4. Ein VPN hilft hier nicht</h2>
  <p>Ein VPN verlegt Ihren Datenverkehr, nicht Ihre Nachrichten — gescannt wird dort, wo die Nachricht verarbeitet wird. Wählen Sie die App, nicht den Tunnel.</p>
  <h2>5. Wissen, was trotzdem sichtbar bleibt</h2>
  <p>E2EE schützt den <strong>Inhalt</strong>. Metadaten — wer mit wem, wann, wie oft — bleiben bei den meisten Anbietern sichtbar (Signal und Threema minimieren auch das). Und nichts hier schützt ein Gerät, das jemand anderes entsperrt.</p>
  <h2>6. Was diese Seite nicht abdeckt</h2>
  <p>Der Entwurf <a href="/de/chat-control/">Chatkontrolle 2.0</a> könnte verschlüsselte Apps per Scan auf dem Gerät erreichen — genau deshalb beobachtet dieses Archiv täglich den Satz „wir können Ihre Nachrichten nicht lesen“.</p>
  <p class="note" style="margin-top:1.6rem">Schicken Sie diese Seite der Person, die Sie gefragt hat: „Und was mache ich jetzt?“</p></div>`,
    },
    alerts: {
      title: "Alarme — ScanRecords",
      desc: "Eine Benachrichtigung, sobald ein erfasstes Unternehmen eine Richtlinie oder Angabe unter der Chatkontrolle ändert. Ohne Konto, ohne E-Mail — Abmelden löscht alles.",
      body: () => `
  <h1>Ein Alarm, sobald sich ein Unternehmen bewegt</h1>
  <p class="lede">Sobald ein erfasstes Unternehmen eine Richtlinie, ein Verschlüsselungsversprechen oder eine App-Store-Angabe ändert, kann Ihr Telefon es wissen. Kostenlos, ohne Konto, ohne E-Mail — gespeichert wird nur der Push-Endpunkt Ihres Browsers, und Abmelden löscht ihn.</p>
  <div class="banner st-e2ee" style="margin-top:1.6rem"><strong>Auf iPhone oder Android: erst die Seite installieren</strong>
    <div style="margin-top:.45rem" class="dim"><strong>iPhone:</strong> Teilen → <em>Zum Home-Bildschirm</em>, dann ScanRecords vom Home-Bildschirm öffnen und abonnieren (iOS 16.4+).<br><strong>Android:</strong> Chrome-Menü → <em>Zum Startbildschirm hinzufügen</em> — oder direkt unten abonnieren.</div></div>
  <p style="margin-top:1.4rem"><button id="subscribe" class="btn">Alarme auf diesem Gerät aktivieren</button><button id="unsubscribe" class="btn" hidden>Alarme deaktivieren</button></p>
  <p id="alert-status" class="note" aria-live="polite"></p>
  <h2>Was eine Benachrichtigung auslöst</h2>
  <ul class="about" style="padding-left:1.2rem"><li>Ein erfasstes Unternehmen hat eine Richtlinie, AGB, Sicherheitsseite oder App-Store-Angabe geändert — mit Link zum exakten Vorher/Nachher.</li><li>Sonst nichts. An den meisten Tagen: Stille — das ist der Sinn.</li></ul>
  <h2>Die Ehrlichkeitsbox</h2>
  <p class="note">Die einzige Seite mit JavaScript, und nur nach Ihrem Klick. Abonnieren speichert den Push-Endpunkt — eine zufällige URL — und seine zwei Schlüssel. Keine Cookies, keine E-Mail. Abmelden löscht alles. Null Skripte? Der <a href="/feed.xml">RSS-Feed</a> trägt dieselben Alarme (Statusmeldungen auf Englisch).</p>
  <script src="/alerts.js" defer></script>`,
    },
    glossary: {
      title: "Glossar — ScanRecords",
      desc: "Das Vokabular der Chatkontrolle in Klartext: E2EE, Client-Side-Scanning, Hash-Abgleich, Aufdeckungsanordnungen und mehr.",
      h1: "Glossar",
      lede: "Zwölf Begriffe, die die meisten Chatkontrolle-Debatten tragen — jeder in Klartext.",
      terms: [
        ["Chatkontrolle", "Der Name für zwei EU-Texte: die geltende ePrivacy-Ausnahme („1.0“, freiwilliges Scannen, bis April 2028) und der Entwurf der CSA-Verordnung („2.0“, potenziell verpflichtende Erkennung). Die meiste Verwirrung entsteht durch ihre Vermischung."],
        ["ePrivacy-Ausnahme (Verordnung 2021/1232)", "Die Ausnahme von den EU-Vertraulichkeitsregeln, die Anbietern freiwilliges Scannen privater Kommunikation erlaubt. In Kraft bis April 2028; E2EE ist formell ausgenommen."],
        ["CSA-Verordnung („Chatkontrolle 2.0“)", "Die 2022 vorgeschlagene dauerhafte Verordnung, deren Aufdeckungsanordnungen Scannen verpflichtend machen könnten, auch auf dem Gerät. In Verhandlung; kein Gesetz."],
        ["Ende-zu-Ende-Verschlüsselung (E2EE)", "Nur die kommunizierenden Geräte halten die Schlüssel — der Anbieter kann Inhalte nicht lesen. Signal, WhatsApp, Threema, Olvid, Wire und Element nutzen sie standardmäßig."],
        ["Client-Side-Scanning", "Inhalte auf dem Gerät scannen, vor der Verschlüsselung. Der Mechanismus, mit dem verpflichtende Erkennung E2EE-Apps erreichen würde."],
        ["Hash-Abgleich", "Der Fingerabdruck eines Bildes wird mit einer Datenbank bekannter illegaler Inhalte verglichen. Erkennt nur bereits identifiziertes Material."],
        ["PhotoDNA", "Microsofts Technologie für perzeptuelle Fingerabdrücke (2009), branchenweit im Einsatz."],
        ["Klassifikator", "Ein ML-Modell, das unbekannte Inhalte markiert. Findet neues Material, mit höherem Fehlalarmrisiko."],
        ["NCMEC / CyberTipline", "Der US-Meldekanal. US-Recht verpflichtet zur Meldung — ein von der EU-Ausnahme getrenntes Regime."],
        ["Aufdeckungsanordnung", "Im 2.0-Entwurf eine bindende Anordnung an einen Dienst, zu scannen. Das, was Scannen von freiwillig zu verpflichtend machen würde."],
        ["Trilog", "Die Verhandlung hinter verschlossenen Türen zwischen Rat, Parlament und Kommission. Der 2.0-Trilog scheiterte im Juni 2026."],
        ["Metadaten", "Wer mit wem, wann, von wo. Nicht von E2EE geschützt und nicht Gegenstand des Scannens — aber aufschlussreich genug für eigene Wachsamkeit."],
      ],
    },
  },

  // ————————————————————————————————————————————————————————— ESPAÑOL ——
  es: {
    htmlLang: "es", name: "Español",
    ui: {
      skip: "Ir al contenido",
      nav: [["", "Comprobar", "home"], ["chat-control/", "Chat Control", "cc"], ["switch/", "Protegerse", "switch"], ["alerts/", "Alertas", "alerts"], ["glossary/", "Glosario", "gloss"]],
      brand: "el archivo de políticas frente al Chat Control.",
      brand2: "Registro diario. Sin cookies, sin rastreadores, sin cuentas — nada que consentir.",
      cols: ["Explorar", "El registro", "Reglas"],
      colExplore: [["", "El comprobador"], ["chat-control/", "¿Qué es el Chat Control?"], ["switch/", "Protegerse"], ["glossary/", "Glosario"]],
      colExploreEN: [["/numbers/", "Las cifras (EN)"], ["/notes/", "Notas (EN)"]],
      colRecord: [["/companies/", "Empresas seguidas (EN)"], ["alerts/", "Alertas"], ["/data/", "Datos CC0 (EN)"]],
      colRules: [["/about/", "Método (EN)"], ["/legal/", "Aviso legal"]],
      policyLabel: "Política editorial",
      statusNote: (d, repo) => `Estados evaluados el ${d} a partir de fuentes públicas — <strong>describen lo que las empresas declaran y presentan, no mediciones de su software</strong>. Las fichas detalladas de las empresas están en inglés. ¿Un estado le parece erróneo? <a href="${repo}/issues">Impúgnelo</a> — las impugnaciones se publican.`,
    },
    status: {
      confirmed: { label: "Escanea bajo el Chat Control de la UE", verdict: "Escanea bajo Chat Control — confirmado",
        blurb: "Los informes obligatorios de la excepción solo existen para los proveedores que realmente escanean comunicaciones privadas. Exactamente cinco los presentaron, para 2023 y 2024, según el informe de aplicación de la Comisión — uso del Chat Control, documentado por la propia UE." },
      global: { label: "Escanea globalmente — sin pruebas en la UE", verdict: "Escanea bajo ley de EE. UU. · sin pruebas UE",
        blurb: "Sus documentos revelan escaneo de contenidos bajo la ley estadounidense (informes al NCMEC, PhotoDNA). Ninguna prueba de que invoquen la excepción europea para comunicaciones privadas — el escaneo «ley de EE. UU.» y el Chat Control son regímenes distintos." },
      unclear: { label: "Sin declaración clara", verdict: "No se pronuncia",
        blurb: "Sin cifrado de extremo a extremo, y sin declaración pública clara, en ningún sentido, sobre el escaneo de comunicaciones privadas." },
      denies: { label: "Afirma que no escanea", verdict: "Afirma que no escanea",
        blurb: "La empresa declara públicamente que no escanea el contenido de los mensajes." },
      e2ee: { label: "Cifrado de extremo a extremo — fuera del ámbito", verdict: "No puede leer sus mensajes",
        blurb: "El contenido está cifrado de extremo a extremo; las comunicaciones E2EE están formalmente excluidas del escaneo voluntario del Chat Control." },
    },
    home: {
      title: "ScanRecords — ¿su app escanea sus mensajes bajo el Chat Control de la UE?",
      desc: "Compruebe qué dicen los documentos de su mensajería sobre el Chat Control europeo — registro diario, cada cambio conservado con el antes y el después.",
      eyebrow: "Un registro público — actualizado cada día a las 06:17 UTC",
      h1: "¿Su aplicación de mensajería escanea sus mensajes bajo el Chat&nbsp;Control?",
      lede: (n) => `El Chat Control es la regla europea que permite a los proveedores <strong>escanear voluntariamente los mensajes privados</strong> hasta abril de 2028. Cada empresa decide por sí misma — y las aplicaciones cifradas de extremo a extremo están excluidas. Encuentre la suya abajo: los estados siguen la prueba más sólida disponible. <a href="/es/chat-control/">Cómo funciona →</a>`,
      barAria: (n) => `De ${n} plataformas seguidas`,
      bignums: ["escanean bajo Chat Control", "escanean bajo ley de EE. UU.", "no se pronuncian", "afirma que no escanea", "no pueden — E2EE"],
      how: "Cómo funciona el registro",
      steps: [["1 · Registro", "Cada política, página de seguridad y ficha del App Store se vuelve a consultar cada día a las 06:17 UTC."], ["2 · Diferencia", "Un cambio solo se registra si las palabras realmente cambiaron — con el antes y el después conservados."], ["3 · Testigo", "Cada registro es un commit git público, e Internet Archive captura las páginas modificadas el mismo día."]],
      deeper: "Ir más allá",
      cards: [["es/chat-control/", "¿Qué es el Chat Control? →", "La guía en claro: la cronología, 1.0 contra 2.0, quién escanea de verdad, y qué cambia para sus apps."], ["es/switch/", "Escapar del escaneo →", "La versión práctica: qué apps no pueden leer sus mensajes, la trampa de las copias de seguridad, y por qué una VPN no cambia nada."], ["es/alerts/", "Recibir alertas →", "Una notificación en cuanto una empresa seguida se mueve. Sin cuenta, sin correo."], ["numbers/", "Sus propias cifras (EN) →", "Tasas de error, volúmenes y el efecto del cifrado — según el informe de la Comisión."]],
      trust: [["Sin cookies,", " sin rastreadores — JavaScript solo en la página de alertas, con opt-in"], ["Cada registro", " es un commit git público — infalsificable"], ["Cada estado cita sus pruebas", " y puede impugnarse públicamente"], ["Los datos son CC0", ` — <a href="/data/">reutilícelos</a>`]],
    },
    cc: {
      title: "¿Qué es el Chat Control? — guía en claro — ScanRecords",
      desc: "El Chat Control explicado: el escaneo voluntario vigente hasta abril de 2028, la cronología, 1.0 contra 2.0, quién escanea según el informe de la Comisión, y qué cambia para sus apps.",
      body: (x) => `
  <section class="hero cc-hero"><div class="beam" aria-hidden="true"></div><div class="cc-grid"><div>
    <div class="eyebrow">Reglamento (UE) 2021/1232 — en vigor hasta abril de 2028</div>
    <h1>¿Qué es el Chat&nbsp;Control?</h1>
    <p class="lede">La regla que permite a los proveedores de mensajería <strong>escanear voluntariamente los mensajes privados</strong> en la UE. Ni obligatorio ni universal — y las aplicaciones cifradas de extremo a extremo están excluidas. Esta es la versión en claro, con fuentes primarias.</p>
  </div><div class="cc-eye">${x.EYE_SVG}</div></div></section>
  <div class="about">
  <h2>Qué es</h2>
  <p>En el derecho europeo, leer comunicaciones privadas está normalmente prohibido — también para los proveedores. La excepción ePrivacy (reglamento 2021/1232, apodado <strong>«Chat Control 1.0»</strong>) crea una excepción: los proveedores <em>pueden</em> escanear mensajes privados en busca de material de abuso infantil, si así lo deciden. Caducada en abril de 2026, restablecida por el Consejo y mantenida tras un rechazo fallido en el Parlamento en julio de 2026, rige hasta <strong>abril de 2028</strong>. Una enmienda adoptada en paralelo <strong>excluye formalmente las comunicaciones cifradas de extremo a extremo</strong>.</p>
  <p>Un reglamento separado y permanente (el reglamento CSA, <strong>«Chat Control 2.0»</strong>), que podría hacer obligatoria la detección — incluso en apps cifradas, mediante escaneo en su dispositivo antes del cifrado — sigue en negociación. No es ley.</p>
  <h2>La cronología</h2>
  <ol class="tl">
    <li><b>Dic. 2020</b> — Las reglas de telecomunicaciones extienden ePrivacy a las mensajerías; Facebook suspende su escaneo en la UE de un día para otro.</li>
    <li><b>Jul. 2021</b> — El reglamento 2021/1232 entra en vigor: el escaneo voluntario vuelve a ser legal. Chat Control 1.0.</li>
    <li><b>Ago. 2021</b> — Apple anuncia un escaneo de fotos en el dispositivo; lo abandona a finales de 2022.</li>
    <li><b>Mayo 2022</b> — La Comisión propone el reglamento CSA permanente. Chat Control 2.0.</li>
    <li><b>Nov. 2023</b> — Posición del Parlamento: sin escaneo indiscriminado, proteger el cifrado.</li>
    <li><b>Dic. 2023</b> — Meta activa el E2EE por defecto en Messenger.</li>
    <li><b>Jun. 2024</b> — Fracasa el compromiso de «moderación en la subida» del Consejo.</li>
    <li><b>Dic. 2025</b> — Comienzan los trílogos sobre el 2.0.</li>
    <li><b>Mar.–abr. 2026</b> — El Parlamento rechaza prorrogar el 1.0 (311–228); caduca el 3 de abril.</li>
    <li><b>Jul. 2026</b> — El Consejo lo restablece; la moción de rechazo (314–276) no alcanza la mayoría absoluta de 361. Prorrogado hasta <b>abril de 2028</b>, E2EE excluido.</li>
    <li><b>Jun.–jul. 2026</b> — El trílogo «final» del 2.0 fracasa por el escaneo sin sospecha.</li>
  </ol>
  <h2>1.0 contra 2.0 — no los confunda</h2>
  <div class="scroll"><table class="cmp">
    <thead><tr><th></th><th>Chat Control 1.0 (en vigor)</th><th>Chat Control 2.0 (proyecto)</th></tr></thead>
    <tbody>
    <tr><td class="dim">Naturaleza</td><td>Excepción ePrivacy — reglamento 2021/1232</td><td>Reglamento CSA — propuesto en 2022, en negociación</td></tr>
    <tr><td class="dim">Escaneo</td><td><strong>Voluntario</strong> — cada proveedor decide</td><td>Podría ser <strong>obligatorio</strong> por órdenes de detección</td></tr>
    <tr><td class="dim">Apps cifradas</td><td><strong>Formalmente excluidas</strong></td><td>El núcleo del conflicto — el escaneo en el cliente las afectaría</td></tr>
    <tr><td class="dim">Plazo</td><td>Abril de 2028</td><td>No es ley; nada que caduque</td></tr>
    </tbody></table></div>
  <div class="banner st-unclear" style="margin-top:1.4rem"><strong>Dónde está el 2.0</strong> <span class="dim">— revisado el ${x.assessed}</span>
    <div style="margin-top:.45rem" class="dim">El trílogo supuestamente final fracasó el 29 de junio de 2026 por el escaneo sin sospecha; las negociaciones continúan bajo presidencia irlandesa. Nada es ley todavía.</div></div>
  <h2>Quién lo usa de verdad</h2>
  <p>Los proveedores que escanean bajo la excepción deben presentar informes anuales, y el último informe de la Comisión nombra exactamente a cinco: <em>«Google, LinkedIn, Meta, Microsoft and Yubo submitted reports, for both 2023 and 2024»</em> (<a href="https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A52025DC0740">COM(2025)&nbsp;740</a>). El seguimiento del eurodiputado <a href="https://www.patrick-breyer.de/en/posts/chat-control/">Patrick Breyer</a> añade que solo servicios estadounidenses sin cifrar lo utilizan. Snapchat y Apple figuran en su lista pero <strong>no</strong> entre los cinco declarantes — ambos hechos aparecen en sus fichas.</p>
  <h2>Escanear bajo la ley de EE. UU. no es Chat Control</h2>
  <p>La mayoría de las grandes plataformas estadounidenses escanean los contenidos subidos e informan al <a href="https://www.missingkids.org/cybertiplinedata">NCMEC</a> — un <strong>régimen jurídico estadounidense</strong> que nada dice del uso de la excepción europea. Punto rojo lleno = prueba UE; punto hueco = escaneo «ley de EE. UU.» sin prueba UE.</p>
  <h2>Qué cambia para usted</h2>
  <ul>
    <li><strong>Gmail, la mensajería de Facebook o Instagram, Outlook, LinkedIn en la UE</strong> — el proveedor escanea bajo la excepción, legalmente y por decisión propia. Escaneo automatizado, no una persona leyendo — pero es su correspondencia privada la que se procesa.</li>
    <li><strong>Signal, WhatsApp, Threema, Olvid, Wire, Element</strong> — contenido cifrado de extremo a extremo; nada legible que escanear.</li>
    <li><strong>Una VPN no cambia nada</strong> — el escaneo ocurre en el proveedor, no en la red.</li>
    <li><strong>Telegram es un caso aparte</strong> — los chats en la nube no son E2EE; Telegram <em>podría</em> leerlos, y no dice si los escanea.</li>
  </ul>
  <h2>Los cinco estados</h2>
  <ul>${x.statusList}</ul>
  <h2>Preguntas frecuentes</h2>
  <details><summary>¿Alguien lee mis mensajes de WhatsApp o Signal?</summary><p>No bajo el Chat Control 1.0. Ambos van cifrados de extremo a extremo y están formalmente excluidos. El punto de presión es el <em>proyecto</em> 2.0 — que no es ley.</p></details>
  <details><summary>¿El Chat Control es lo que rompería el cifrado?</summary><p>Eso es el 2.0 — cuyas órdenes de detección podrían imponer un escaneo en su dispositivo, antes del cifrado. Atascado en negociación desde 2022. El 1.0, vigente, excluye el E2EE.</p></details>
  <details><summary>¿Puedo negarme al escaneo actual?</summary><p>Solo eligiendo la aplicación: un servicio cifrado de extremo a extremo — vea <a href="/es/#e2ee">las apps que no pueden leer sus mensajes</a>.</p></details>
  <details><summary>¿Por qué «sin pruebas UE» en vez de «no escanea en la UE»?</summary><p>Porque la ausencia de pruebas es exactamente lo que tenemos. Publicamos la frase verdadera más fuerte, no la frase más fuerte.</p></details>
  <h2>Fuentes</h2>
  <ul class="sources">
    <li><a href="https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A52025DC0740">COM(2025) 740</a> — el informe de aplicación: los cinco declarantes, volúmenes, tasas de error.</li>
    <li><a href="https://www.patrick-breyer.de/en/posts/chat-control/">La página Chat Control de Patrick Breyer</a>.</li>
    <li><a href="https://fightchatcontrol.eu/">fightchatcontrol.eu</a> — posiciones país por país.</li>
    <li><a href="https://edri.org/our-work/csa-regulation-document-pool/">El expediente documental de EDRi</a>.</li>
  </ul></div>`,
    },
    switch: {
      title: "Escapar del escaneo, en la práctica — ScanRecords",
      desc: "La versión práctica: qué apps no pueden leer sus mensajes, la trampa de las copias de WhatsApp, por qué una VPN no cambia nada, y qué sigue filtrándose.",
      body: (x) => `<div class="about">
  <h1>Escapar del escaneo, en la práctica</h1>
  <p class="lede">Todo lo que sigue se desprende del registro: qué se escanea hoy, qué no puede escanearse, y qué ajustes anulan discretamente su protección. Nada que comprar — decisiones.</p>
  <h2>1. El único opt-out real es la aplicación</h2>
  <p>El escaneo del Chat Control ocurre <strong>en el proveedor</strong>. Las apps cifradas de extremo a extremo no tienen nada legible que escanear y están formalmente excluidas:</p>
  ${x.e2eeCards}
  <h2>2. La trampa de las copias de seguridad</h2>
  <p>Los chats de WhatsApp van cifrados — pero una <strong>copia en la nube sin cifrar</strong> deja igualmente una copia legible en los servidores de Apple o Google. Desactívela, o active la <em>copia cifrada de extremo a extremo</em> (Ajustes → Chats → Copia de seguridad).</p>
  <h2>3. El correo es la zona escaneada</h2>
  <p>Gmail y Outlook se escanean en la UE bajo la excepción. Proton declara no escanear el contenido; GMX no se pronuncia. Para correspondencia sensible, la elección del proveedor pesa más que cualquier ajuste.</p>
  <h2>4. Una VPN no protege de esto</h2>
  <p>Una VPN desplaza su tráfico, no sus mensajes — el escaneo ocurre donde se procesa el mensaje. Elija la app, no el túnel.</p>
  <h2>5. Sepa qué sigue filtrándose</h2>
  <p>El E2EE protege el <strong>contenido</strong>. Los metadatos — quién habla con quién, cuándo, con qué frecuencia — siguen visibles en la mayoría de proveedores (Signal y Threema los minimizan). Y nada protege un teléfono desbloqueado por otra persona.</p>
  <h2>6. Qué no cubre esta página</h2>
  <p>El proyecto <a href="/es/chat-control/">Chat Control 2.0</a> podría alcanzar las apps cifradas mediante escaneo en el dispositivo — exactamente por eso este archivo vigila cada día la frase «no podemos leer sus mensajes».</p>
  <p class="note" style="margin-top:1.6rem">Envíe esta página a quien le preguntó «bueno, ¿y qué hago?»</p></div>`,
    },
    alerts: {
      title: "Alertas — ScanRecords",
      desc: "Una notificación en cuanto una empresa seguida modifica una política o ficha bajo el Chat Control. Sin cuenta, sin correo — darse de baja lo borra todo.",
      body: () => `
  <h1>Una alerta en cuanto una empresa se mueve</h1>
  <p class="lede">En cuanto una empresa seguida modifica una política, una promesa de cifrado o una ficha del App Store, su teléfono puede saberlo. Gratis, sin cuenta, sin correo — solo se guarda el punto de conexión push de su navegador, y darse de baja lo borra.</p>
  <div class="banner st-e2ee" style="margin-top:1.6rem"><strong>En iPhone o Android, instale primero el sitio</strong>
    <div style="margin-top:.45rem" class="dim"><strong>iPhone:</strong> Compartir → <em>Añadir a pantalla de inicio</em>, luego abra ScanRecords desde la pantalla de inicio y suscríbase (iOS 16.4+).<br><strong>Android:</strong> menú de Chrome → <em>Añadir a pantalla de inicio</em> — o suscríbase directamente abajo.</div></div>
  <p style="margin-top:1.4rem"><button id="subscribe" class="btn">Activar alertas en este dispositivo</button><button id="unsubscribe" class="btn" hidden>Desactivar alertas</button></p>
  <p id="alert-status" class="note" aria-live="polite"></p>
  <h2>Qué dispara una notificación</h2>
  <ul class="about" style="padding-left:1.2rem"><li>Una empresa seguida modificó una política, condiciones, página de seguridad o su ficha del App Store — con enlace al antes/después exacto.</li><li>Nada más. La mayoría de los días: silencio — ese es el objetivo.</li></ul>
  <h2>La caja de honestidad</h2>
  <p class="note">La única página del sitio con JavaScript, y solo tras su clic. Suscribirse guarda el punto de conexión push — una URL aleatoria — y sus dos claves. Sin cookies, sin correo. Darse de baja lo borra todo. ¿Cero scripts? El <a href="/feed.xml">feed RSS</a> lleva las mismas alertas (mensajes de estado en inglés).</p>
  <script src="/alerts.js" defer></script>`,
    },
    glossary: {
      title: "Glosario — ScanRecords",
      desc: "El vocabulario del Chat Control en lenguaje claro: E2EE, escaneo en el cliente, coincidencia de huellas, órdenes de detección y más.",
      h1: "Glosario",
      lede: "Doce términos que sostienen la mayoría de los debates sobre el Chat Control — cada uno en lenguaje claro.",
      terms: [
        ["Chat Control", "El apodo de dos textos europeos: la excepción ePrivacy vigente («1.0», escaneo voluntario, hasta abril de 2028) y el proyecto de reglamento CSA («2.0», detección potencialmente obligatoria). Casi toda la confusión viene de mezclarlos."],
        ["Excepción ePrivacy (reglamento 2021/1232)", "La excepción a las reglas europeas de confidencialidad que permite a los proveedores escanear voluntariamente comunicaciones privadas. Vigente hasta abril de 2028; el E2EE está formalmente excluido."],
        ["Reglamento CSA («Chat Control 2.0»)", "El reglamento permanente propuesto en 2022, cuyas órdenes de detección podrían hacer obligatorio el escaneo, incluso en el dispositivo. En negociación; no es ley."],
        ["Cifrado de extremo a extremo (E2EE)", "Solo los dispositivos que se comunican poseen las claves — el proveedor no puede leer el contenido. Signal, WhatsApp, Threema, Olvid, Wire y Element lo activan por defecto."],
        ["Escaneo en el cliente", "Escanear el contenido en el dispositivo, antes del cifrado. El mecanismo por el que una detección obligatoria alcanzaría las apps E2EE."],
        ["Coincidencia de huellas (hash matching)", "Comparar la huella de una imagen con una base de contenidos ilegales conocidos. Solo detecta material ya identificado."],
        ["PhotoDNA", "La tecnología de huellas perceptuales de Microsoft (2009), usada en toda la industria."],
        ["Clasificador", "Un modelo de aprendizaje automático que marca contenidos nunca vistos. Detecta material nuevo, con más falsos positivos."],
        ["NCMEC / CyberTipline", "El canal de denuncia estadounidense. La ley de EE. UU. obliga a informar allí — un régimen distinto de la excepción europea."],
        ["Orden de detección", "En el proyecto 2.0, una orden vinculante que obliga a un servicio a escanear. Lo que convertiría el escaneo de voluntario en obligatorio."],
        ["Trílogo", "La negociación a puerta cerrada entre Consejo, Parlamento y Comisión. El del 2.0 fracasó en junio de 2026."],
        ["Metadatos", "Quién habla con quién, cuándo, desde dónde. Fuera del E2EE y fuera del escaneo — pero lo bastante reveladores para merecer su propia vigilancia."],
      ],
    },
  },
};

/** Render every locale's five pages. ctx supplies data + shell helpers. */
export function emitLocales(ctx) {
  const { esc, fmtDate, ASSESSED, companies, shortName, EYE_SVG, groupsFor, writePage } = ctx;
  for (const [code, L] of Object.entries(LOCALES)) {
    const groups = groupsFor(L.status);
    const assessed = fmtDate(ASSESSED);

    const cardsHTML = groups
      .map(
        (g) => `
  <h2 class="grouphead" id="${g.key}"><span class="${g.cls}"><span class="dot"></span>${g.label}</span> <span class="count">${g.companies.length}</span></h2>
  <p class="groupnote">${g.blurb}</p>
  <div class="cards">${g.companies
    .map((c) => `<a class="card ${g.cls}" href="/company/${c.slug}/" hreflang="en">
      <span class="mg" aria-hidden="true">${esc(shortName(c)[0])}</span>
      <span><span class="nm">${esc(shortName(c))}</span><br><span class="vd">${g.verdict}</span></span></a>`)
    .join("")}</div>`
      )
      .join("");

    const H = L.home;
    const homeBody = `
  <section class="hero">
    <div class="beam" aria-hidden="true"></div>
    <div class="heroeye" aria-hidden="true">${EYE_SVG}</div>
    <div class="eyebrow"><span class="livedot"></span> ${H.eyebrow}</div>
    <h1>${H.h1}</h1>
    <p class="lede">${H.lede(companies.length)}</p>
    <div class="bar" role="img" aria-label="${H.barAria(companies.length)}">
      ${groups.map((g) => `<i class="seg-${g.key}" style="flex:${g.companies.length}"></i>`).join("")}
    </div>
    <div class="bignums">
      ${groups.map((g, i) => `<a href="#${g.key}"><b class="${["n-red", "n-redsoft", "n-gray", "n-greensoft", "n-green"][i]}">${g.companies.length}</b><span>${H.bignums[i]}</span></a>`).join("\n      ")}
    </div>
  </section>
  ${cardsHTML}
  <p class="note" style="margin-top:1.2rem">${L.ui.statusNote(assessed, ctx.REPO)}</p>
  <h2>${H.how}</h2>
  <div class="steps">${H.steps.map(([b, t]) => `<div class="step"><b>${b}</b>${t}</div>`).join("")}</div>
  <h2>${H.deeper}</h2>
  <div class="bigcards">${H.cards.map(([href, h3, p]) => `<a class="bigcard" href="/${href}"><h3>${h3}</h3><p>${p}</p></a>`).join("")}</div>
  <div class="trust">${H.trust.map(([b, rest]) => `<span><b>${b}</b>${rest}</span>`).join("\n    ")}</div>`;

    const statusList = groups
      .map((g) => `<li><span class="${g.cls}"><span class="dot"></span><strong>${g.label}</strong></span> — ${g.blurb}</li>`)
      .join("");
    const e2eeCards = `<div class="cards">${groups
      .find((g) => g.key === "e2ee")
      .companies.map(
        (c) => `<a class="card st-e2ee" href="/company/${c.slug}/" hreflang="en">
      <span class="mg" aria-hidden="true">${esc(shortName(c)[0])}</span>
      <span><span class="nm">${esc(shortName(c))}</span><br><span class="vd">${L.status.e2ee.verdict}</span></span></a>`
      )
      .join("")}</div>`;

    const x = { EYE_SVG, assessed, statusList, e2eeCards };
    const glossBody = `<div class="about">
  <h1>${L.glossary.h1}</h1>
  <p class="lede">${L.glossary.lede}</p>
  <dl class="gloss">${L.glossary.terms
    .map(([t, d]) => `<dt id="${t.toLowerCase().replace(/[^a-z0-9]+/g, "-")}">${esc(t)}</dt><dd>${esc(d)}</dd>`)
    .join("")}</dl></div>`;

    writePage(code, "home", { title: H.title, desc: H.desc, active: "home", body: homeBody });
    writePage(code, "cc", { title: L.cc.title, desc: L.cc.desc, active: "cc", body: L.cc.body(x) });
    writePage(code, "switch", { title: L.switch.title, desc: L.switch.desc, active: "switch", body: L.switch.body(x) });
    writePage(code, "alerts", { title: L.alerts.title, desc: L.alerts.desc, active: "alerts", body: L.alerts.body(x) });
    writePage(code, "glossary", { title: L.glossary.title, desc: L.glossary.desc, active: "gloss", body: glossBody });
  }
}
