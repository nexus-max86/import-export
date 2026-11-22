import type { Metadata } from 'next';
import { KONZIA_CONTACT, LegalPage, Section } from '@/components/legal';

export const metadata: Metadata = { title: 'Politique de confidentialité — Konzia' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Politique de confidentialité" updated="22 novembre 2026">
      <Section title="1. Responsable du traitement">
        <p>
          [Nom ou raison sociale de l’éditeur, RCCM, adresse], qui édite Konzia. Contact pour toute
          question sur vos données : WhatsApp {KONZIA_CONTACT.whatsappIntl} ou [adresse e-mail à
          compléter]. Ce traitement respecte le droit congolais, notamment le Code du numérique
          (ordonnance-loi n° 23/010 du 13 mars 2023).
        </p>
      </Section>

      <Section title="2. Les données que nous traitons">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Compte</strong> : nom, adresse e-mail, mot de passe (enregistré sous forme
            chiffrée irréversible, jamais lisible), numéro WhatsApp, ville et adresses de livraison.
          </li>
          <li>
            <strong>Commandes</strong> : articles demandés, liens et captures, devis, paiements
            déclarés ou confirmés, preuves de paiement, suivi des colis, litiges.
          </li>
          <li>
            <strong>Commissionnaires</strong> : nom commercial, RCCM et pièce d’identité du
            responsable (pour la vérification), coordonnées de paiement affichées aux clients.
          </li>
          <li>
            <strong>Sécurité</strong> : appareils connectés, empreinte de l’adresse IP (jamais
            l’adresse en clair), journal des actions sensibles.
          </li>
        </ul>
      </Section>

      <Section title="3. Pourquoi">
        <ul className="list-disc space-y-1 pl-5">
          <li>Faire fonctionner le service : devis, commandes, paiements, suivi, notifications.</li>
          <li>Vérifier les commissionnaires et prévenir la fraude.</li>
          <li>Traiter les litiges et répondre à vos demandes.</li>
          <li>Respecter nos obligations légales (comptabilité, réquisitions des autorités).</li>
        </ul>
        <p>
          Aucune publicité ciblée, aucune revente de données. Les e-mails de notification peuvent
          être désactivés type par type dans la page Notifications.
        </p>
      </Section>

      <Section title="4. Qui voit vos données">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Le commissionnaire que vous choisissez</strong> voit ce qui est nécessaire à
            votre commande. Un autre commissionnaire ne voit rien de vous.
          </li>
          <li>
            Dans un colis partagé, chaque client ne voit que ses propres articles, jamais ceux ni
            l’identité des autres.
          </li>
          <li>
            Les prix d’achat réels d’un commissionnaire ne sont visibles que par lui, ses acheteurs
            et son comptable.
          </li>
          <li>
            L’équipe Konzia accède aux données seulement quand c’est nécessaire (vérification,
            litige, support) ; chaque consultation est enregistrée.
          </li>
          <li>
            Nos prestataires techniques, tenus à la confidentialité : hébergement des serveurs et
            des fichiers [hébergeur et pays à compléter], envoi des e-mails [prestataire à
            compléter]. Les fichiers (RCCM, pièces d’identité, preuves) sont chiffrés avant d’être
            stockés.
          </li>
        </ul>
      </Section>

      <Section title="5. Combien de temps">
        <ul className="list-disc space-y-1 pl-5">
          <li>Compte : tant qu’il est actif, puis [durée à fixer] après sa fermeture.</li>
          <li>
            Commandes, paiements et litiges : [durée légale de conservation des pièces comptables à
            confirmer], car ils servent de preuve.
          </li>
          <li>
            Documents de vérification d’un commissionnaire : pendant son activité, puis [durée à
            fixer].
          </li>
          <li>Sauvegardes chiffrées : 30 jours.</li>
        </ul>
      </Section>

      <Section title="6. Vos droits">
        <p>
          Vous pouvez demander l’accès à vos données, leur correction, ou leur suppression quand
          elles ne doivent pas être conservées pour une obligation légale ou une commande en cours.
          Vous pouvez aussi vous opposer à certains traitements. Écrivez-nous sur WhatsApp au{' '}
          {KONZIA_CONTACT.whatsapp} ; nous répondons dans un délai d’un mois au plus.
        </p>
      </Section>

      <Section title="7. Cookies">
        <p>
          Konzia utilise un seul cookie, indispensable : celui qui garde votre session ouverte.
          Aucun cookie publicitaire ni de mesure d’audience.
        </p>
      </Section>

      <Section title="8. Sécurité">
        <p>
          Connexion chiffrée (HTTPS), mots de passe chiffrés de façon irréversible, fichiers
          chiffrés, séparation stricte des données entre commissionnaires, double authentification
          obligatoire pour l’équipe Konzia, journal des actions sensibles et sauvegardes chiffrées
          quotidiennes.
        </p>
      </Section>
    </LegalPage>
  );
}
