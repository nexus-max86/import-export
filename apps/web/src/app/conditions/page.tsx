import type { Metadata } from 'next';
import { KONZIA_CONTACT, LegalPage, Section } from '@/components/legal';

export const metadata: Metadata = { title: 'Conditions d’utilisation — Konzia' };

export default function TermsPage() {
  return (
    <LegalPage title="Conditions d’utilisation" updated="22 novembre 2026">
      <Section title="1. Qui sommes-nous">
        <p>
          Konzia est une plateforme qui met en relation des clients en République démocratique du
          Congo avec des commissionnaires indépendants, qui achètent pour eux à l’étranger et
          organisent l’acheminement de leurs articles. Elle est éditée par [nom ou raison sociale de
          l’éditeur, RCCM, adresse]. Contact : WhatsApp {KONZIA_CONTACT.whatsappIntl}.
        </p>
      </Section>

      <Section title="2. Le rôle de Konzia">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Konzia fournit l’outil : demandes de devis, devis, commandes, suivi des paiements et des
            colis, notifications.
          </li>
          <li>
            <strong>
              Konzia ne vend pas les articles et ne reçoit jamais l’argent des achats.
            </strong>{' '}
            Le client paie directement son commissionnaire (M-Pesa, Orange Money, espèces, banque…).
            Konzia enregistre seulement ce qui est déclaré et confirmé.
          </li>
          <li>
            Le commissionnaire choisi par le client est seul responsable de l’achat, du transport,
            du dédouanement et de la remise des articles, dans les conditions de son devis.
          </li>
        </ul>
      </Section>

      <Section title="3. Votre compte">
        <ul className="list-disc space-y-1 pl-5">
          <li>Vous devez avoir 18 ans au moins et donner des informations exactes.</li>
          <li>
            Vous gardez votre mot de passe secret. Vous pouvez déconnecter vos appareils à tout
            moment depuis votre compte.
          </li>
          <li>
            Un commissionnaire peut créer une fiche pour un client qui n’a pas de compte (« client
            géré »). Ce client peut ensuite relier cette fiche à son propre compte.
          </li>
        </ul>
      </Section>

      <Section title="4. Commissionnaires">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Pour être visible des clients, un commissionnaire fait vérifier son activité : RCCM et
            pièce d’identité du responsable. La vérification atteste des documents fournis, pas de
            la qualité du service.
          </li>
          <li>
            Il s’engage à présenter des devis clairs (prix, frais, délais, conditions d’annulation
            et de remboursement), à enregistrer fidèlement les paiements reçus et à tenir le suivi
            des colis à jour.
          </li>
          <li>
            Konzia peut suspendre un commissionnaire en cas de manquement grave ou de fraude, avec
            un motif écrit. Ses clients gardent l’accès à leurs commandes en cours.
          </li>
        </ul>
      </Section>

      <Section title="5. Devis, commandes et paiements">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Un devis envoyé ne change plus : une correction crée une nouvelle version. En
            l’acceptant, le client passe commande auprès du commissionnaire.
          </li>
          <li>
            Un ajustement de prix (douane, poids réel…) doit être motivé et accepté par le client.
          </li>
          <li>
            Un paiement déclaré par le client reste « à vérifier » tant que le commissionnaire ne
            l’a pas confirmé. Un remboursement est enregistré à part, jamais en modifiant le
            paiement d’origine.
          </li>
          <li>
            Les paiements en francs congolais sont convertis au taux publié par Konzia le jour du
            paiement ; le taux utilisé est conservé.
          </li>
        </ul>
      </Section>

      <Section title="6. Litiges">
        <p>
          En cas de problème (article non reçu, abîmé, différent…), le client ouvre un litige depuis
          sa commande, avec ses preuves. Le commissionnaire répond. À défaut d’accord, l’équipe
          Konzia rend une décision motivée, visible des deux parties. Cette procédure ne prive
          personne de ses recours devant les juridictions compétentes.
        </p>
      </Section>

      <Section title="7. Usages interdits">
        <p>
          Fausses informations ou faux documents, articles interdits à l’importation en RDC,
          tentative d’accéder aux données d’autres utilisateurs ou commissionnaires, usage
          automatisé abusif de la plateforme. Ces usages entraînent la suspension du compte.
        </p>
      </Section>

      <Section title="8. Responsabilité">
        <p>
          Konzia met tout en œuvre pour que la plateforme fonctionne et que les données soient
          protégées, mais ne garantit pas une disponibilité sans interruption. Konzia n’est pas
          responsable de l’exécution des achats et livraisons, qui relèvent du commissionnaire.
        </p>
      </Section>

      <Section title="9. Évolution des conditions et droit applicable">
        <p>
          Ces conditions peuvent évoluer ; la date de version figure en haut de page et les
          changements importants vous sont signalés. Elles sont régies par le droit de la République
          démocratique du Congo. [Juridiction compétente à préciser.]
        </p>
      </Section>
    </LegalPage>
  );
}
