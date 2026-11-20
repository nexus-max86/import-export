import type { OutgoingEmail } from './email-sender';

export function verifyEmailMessage(to: string, name: string, link: string): OutgoingEmail {
  return {
    to,
    subject: 'Confirmez votre adresse e-mail Konzia',
    text: [
      `Bonjour ${name},`,
      '',
      'Pour activer votre compte Konzia, ouvrez ce lien :',
      link,
      '',
      'Ce lien est valable 48 heures. Si vous n’avez pas créé de compte, ignorez ce message.',
    ].join('\n'),
  };
}

export function resetPasswordMessage(to: string, name: string, link: string): OutgoingEmail {
  return {
    to,
    subject: 'Réinitialisation de votre mot de passe Konzia',
    text: [
      `Bonjour ${name},`,
      '',
      'Pour choisir un nouveau mot de passe, ouvrez ce lien :',
      link,
      '',
      'Ce lien est valable 1 heure et ne fonctionne qu’une fois. Toutes vos sessions seront déconnectées.',
      'Si vous n’avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.',
    ].join('\n'),
  };
}

export function invitationMessage(
  to: string,
  orgName: string,
  roleLabel: string,
  link: string,
): OutgoingEmail {
  return {
    to,
    subject: `Invitation à rejoindre ${orgName} sur Konzia`,
    text: [
      'Bonjour,',
      '',
      `${orgName} vous invite à rejoindre son équipe sur Konzia, avec le rôle « ${roleLabel} ».`,
      'Pour accepter, connectez-vous (ou créez un compte avec cette adresse e-mail) puis ouvrez ce lien :',
      link,
      '',
      'Cette invitation est valable 7 jours.',
    ].join('\n'),
  };
}
