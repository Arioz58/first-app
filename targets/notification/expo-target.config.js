/**
 * Extension de notification iOS.
 *
 * Elle intercepte chaque notification avant affichage pour la mettre en forme façon
 * « conversation » : photo de l'expéditeur (ou du groupe) à la place de l'icône de l'app,
 * nom en titre, message en corps.
 *
 * ⚠️ Aucun entitlement déclaré ici. `com.apple.developer.usernotifications.communication`
 * y a été essayé le 1er août 2026 et le build a échoué à la signature :
 *
 *   error: Entitlement com.apple.developer.usernotifications.communication not found and
 *   could not be included in profile (in target 'NexaNotificationService')
 *
 * La cible a son PROPRE App ID (`com.berke.nexa2.notification-service`) et la capability
 * « Communication Notifications » n'y est pas activée — le provisioning automatique ne
 * sait pas l'ajouter, il faut la cocher à la main sur developer.apple.com. Tant que ce
 * n'est pas fait, la déclarer casse TOUT le build, pas seulement l'extension.
 *
 * Le code Swift retente l'API à chaque notification et retombe sur une vignette tant
 * qu'elle échoue : rétablir l'entitlement ici suffira, sans autre changement.
 */
module.exports = {
  type: 'notification-service',
  name: 'NexaNotificationService',
};
