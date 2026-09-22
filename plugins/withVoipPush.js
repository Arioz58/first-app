const { withAppDelegate, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * PushKit : ce qui fait sonner un téléphone VERROUILLÉ.
 *
 * ⚠️ POURQUOI CE PLUGIN EXISTE. Le code ci-dessous doit vivre dans `AppDelegate.swift` et
 * dans le bridging header — deux fichiers que `expo prebuild --clean` REGÉNÈRE à chaque
 * build, et ce prebuild est obligatoire chez nous (`@bacons/apple-targets`). Écrit à la
 * main, ce code disparaîtrait au build suivant, et la fonctionnalité s'évaporerait sans que
 * rien ne le signale. Le plugin le réinjecte donc à chaque génération.
 *
 * ⚠️ POURQUOI PUSHKIT ET PAS UNE NOTIFICATION ORDINAIRE. L'application ferme son socket dès
 * qu'elle passe en arrière-plan — c'est précisément ce qui permet aux notifications
 * d'exister. Un téléphone verrouillé n'a donc plus rien qui écoute. Seul un push VoIP
 * réveille le processus à coup sûr, et c'est le seul que le système autorise à déclencher
 * un écran d'appel.
 *
 * ⚠️ RÈGLE D'APPLE, NON NÉGOCIABLE (iOS 13+) : à la réception d'un push VoIP, l'application
 * DOIT signaler un appel entrant à CallKit dans le même cycle. Si elle ne le fait pas, iOS
 * tue le processus et, après quelques manquements, cesse de délivrer les pushes VoIP. C'est
 * pour cela que `reportNewIncomingCall` est appelé AVANT toute autre chose, avant même de
 * prévenir le JavaScript — qui, lui, peut n'être pas encore démarré.
 */

/**
 * ⚠️ `import PushKit` SEULEMENT. `RNVoipPushNotificationManager` et `RNCallKeep` sont des
 * classes Objective-C : elles n'exposent pas de module Swift et arrivent par le bridging
 * header (voir plus bas). Un `import RNVoipPushNotification` fait échouer la compilation
 * avec « no such module », une erreur qui laisse croire à un paquet manquant alors que le
 * paquet est bien là.
 */
const IMPORTS = `import PushKit
`;

/** Ce qu'on ajoute à la classe AppDelegate. */
const PUSHKIT_BODY = `
  // MARK: - PushKit (appels entrants, téléphone verrouillé)

  /**
   * ⚠️ Enregistré au LANCEMENT, pas au premier appel : le jeton VoIP n'est délivré qu'en
   * réponse à cet enregistrement, et sans jeton le serveur n'a nulle part où pousser.
   */
  func registerVoipPush() {
    let registry = PKPushRegistry(queue: nil)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    voipRegistry = registry
  }

  public func pushRegistry(
    _ registry: PKPushRegistry,
    didUpdate pushCredentials: PKPushCredentials,
    for type: PKPushType
  ) {
    // Le jeton part vers le JavaScript, qui l'enregistre auprès de notre serveur.
    RNVoipPushNotificationManager.didUpdate(pushCredentials, forType: type.rawValue as String)
  }

  public func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    let data = payload.dictionaryPayload
    let uuid = (data["callId"] as? String) ?? UUID().uuidString
    let name = (data["callerName"] as? String) ?? "Appel"

    /**
     * ⚠️ AVANT TOUT LE RESTE. iOS exige que l'appel soit signalé à CallKit dans le même
     * cycle que la réception du push. Le JavaScript peut très bien ne pas être démarré —
     * le téléphone était verrouillé, l'application fermée — donc on ne peut pas attendre
     * qu'il réagisse. C'est le code natif qui fait sonner.
     */
    RNCallKeep.reportNewIncomingCall(
      uuid,
      handle: name,
      handleType: "generic",
      hasVideo: false,
      localizedCallerName: name,
      supportsHolding: false,
      supportsDTMF: false,
      supportsGrouping: false,
      supportsUngrouping: false,
      fromPushKit: true,
      payload: data,
      withCompletionHandler: completion
    )

    // Puis on transmet au JavaScript, qui rattrapera l'état de l'appel quand il démarrera.
    RNVoipPushNotificationManager.didReceiveIncomingPush(with: payload, forType: type.rawValue as String)
  }
`;

const withVoipAppDelegate = (config) =>
  withAppDelegate(config, (config) => {
    let src = config.modResults.contents;

    if (src.includes('RNVoipPushNotification')) return config; // déjà injecté

    // 1. Les imports, juste après ceux d'Expo.
    src = src.replace('import Expo\n', `import Expo\n${IMPORTS}`);

    // 2. La classe doit annoncer qu'elle répond à PushKit, sinon le système ne lui
    //    transmet rien — et l'absence est silencieuse.
    src = src.replace(
      'public class AppDelegate: ExpoAppDelegate {',
      'public class AppDelegate: ExpoAppDelegate, PKPushRegistryDelegate {\n  var voipRegistry: PKPushRegistry?',
    );

    // 3. L'enregistrement, au lancement.
    src = src.replace(
      '    let delegate = ReactNativeDelegate()',
      '    registerVoipPush()\n\n    let delegate = ReactNativeDelegate()',
    );

    // 4. Le corps, ajouté à la fin de la classe AppDelegate — repérée par sa dernière
    //    accolade avant la classe suivante.
    const anchor = '\nclass ReactNativeDelegate';
    const at = src.indexOf(anchor);
    if (at === -1) throw new Error('withVoipPush : structure d\'AppDelegate inattendue');
    const closing = src.lastIndexOf('}', at);
    src = src.slice(0, closing) + PUSHKIT_BODY + src.slice(closing);

    config.modResults.contents = src;
    return config;
  });

/**
 * Le bridging header : c'est lui qui rend les classes Objective-C de `callkeep` et de
 * `voip-push-notification` visibles depuis le Swift de l'AppDelegate.
 *
 * ⚠️ Sans cela, le projet ne compile pas — et l'erreur ne parle ni de PushKit ni d'appels,
 * seulement d'un identifiant inconnu.
 */
const withVoipBridgingHeader = (config) =>
  withDangerousMod(config, [
    'ios',
    (config) => {
      const name = config.modRequest.projectName;
      const file = path.join(
        config.modRequest.platformProjectRoot,
        name,
        `${name}-Bridging-Header.h`,
      );
      if (!fs.existsSync(file)) return config;
      let content = fs.readFileSync(file, 'utf8');
      if (content.includes('RNCallKeep.h')) return config;
      content += `
#import "RNCallKeep.h"
#import "RNVoipPushNotificationManager.h"
`;
      fs.writeFileSync(file, content);
      return config;
    },
  ]);

module.exports = (config) => withVoipBridgingHeader(withVoipAppDelegate(config));
