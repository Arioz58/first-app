import Intents
import UIKit
import UserNotifications

/// Remet en forme les notifications avant affichage pour qu'elles ressemblent à celles de
/// Messages : la photo de l'expéditeur (ou du groupe) prend la place de l'icône de l'app,
/// le nom sert de titre et le message reste le corps.
///
/// C'est le rôle d'une « notification de conversation » : on reconstitue l'intention
/// `INSendMessageIntent` que l'app aurait déclarée si le message avait été reçu au premier
/// plan, et iOS en tire la mise en forme. Cela exige l'entitlement
/// `com.apple.developer.usernotifications.communication`, porté par l'app principale.
///
/// Si l'API est refusée, `updating(from:)` échoue : on retombe alors sur une pièce jointe,
/// qui affiche la photo en vignette **à droite** du texte. La notification reste donc
/// lisible dans tous les cas, seule la place de la photo change.
///
/// Données envoyées par le serveur (le service push d'Expo les range sous la clé `body`
/// de `userInfo`) :
/// - `displayName` — ce qui doit s'afficher en titre : la personne, ou le **groupe** ;
/// - `avatarUrl` — photo de la personne ou du groupe, absente si aucune n'est définie ;
/// - `conversationId` — identifie la conversation (regroupement, ouverture au tap) ;
/// - `senderName` + `messageBody` — **groupes uniquement** : qui parle, et le message seul.
///   Le corps envoyé vaut « Alice : salut » pour les plateformes sans sous-titre ; ici on
///   le scinde en sous-titre + corps.
class NotificationService: UNNotificationServiceExtension {
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttempt: UNMutableNotificationContent?

  private static let circleBackground = UIColor(red: 0.937, green: 0.965, blue: 1.0, alpha: 1) // #EFF6FF
  private static let nexa = UIColor(red: 0.118, green: 0.251, blue: 0.686, alpha: 1) // #1E40AF
  private static let avatarSide: CGFloat = 180 // rendu large : sert la bannière comme le centre de notifications

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    bestAttempt = request.content.mutableCopy() as? UNMutableNotificationContent

    guard let content = bestAttempt else {
      contentHandler(request.content)
      return
    }

    // `userInfo` est typé [AnyHashable: Any] : on le ramène à des clés String, en
    // regardant d'abord sous « body », où le service push d'Expo range les données.
    let info = request.content.userInfo
    let payload: [String: Any] =
      (info["body"] as? [String: Any]) ?? (info as? [String: Any]) ?? [:]
    let name = payload["displayName"] as? String ?? content.title
    let conversationId = payload["conversationId"] as? String
    let senderName = payload["senderName"] as? String

    // Groupe : le nom du groupe reste le titre, l'expéditeur passe en sous-titre et le
    // corps ne garde que le message — sans quoi le nom apparaîtrait deux fois.
    if let senderName, let messageBody = payload["messageBody"] as? String {
      content.subtitle = senderName
      content.body = messageBody
    }

    guard
      let avatar = payload["avatarUrl"] as? String,
      let url = URL(string: avatar)
    else {
      // Ni photo de profil ni photo de groupe : on dessine l'avatar par défaut de l'app
      // plutôt que de laisser iOS retomber sur l'icône de l'app.
      deliver(
        decorate(
          content,
          photo: fallbackAvatar(name: name, isGroup: senderName != nil),
          name: name,
          senderName: senderName,
          conversationId: conversationId
        )
      )
      return
    }

    // L'extension dispose d'environ 30 s au total ; on coupe bien avant pour que
    // `serviceExtensionTimeWillExpire` n'ait pas à rattraper le coup.
    var download = URLRequest(url: url)
    download.timeoutInterval = 10

    URLSession.shared.dataTask(with: download) { [weak self] data, _, _ in
      guard let self else { return }
      // Téléchargement en échec (hors ligne, photo supprimée) : l'avatar par défaut vaut
      // mieux qu'un retour à l'icône de l'app.
      let photo = (data?.isEmpty == false)
        ? data
        : self.fallbackAvatar(name: name, isGroup: senderName != nil)
      self.deliver(
        self.decorate(
          content,
          photo: photo,
          name: name,
          senderName: senderName,
          conversationId: conversationId
        )
      )
    }.resume()
  }

  /// Livre la notification, une seule fois (le système ignore les appels suivants, mais
  /// le contrat de l'API veut qu'on n'en fasse qu'un).
  private func deliver(_ content: UNNotificationContent) {
    contentHandler?(content)
    contentHandler = nil
  }

  // MARK: - Avatars par défaut

  /// Reprend les avatars par défaut de l'app : deux silhouettes pour un groupe
  /// (`Ionicons people`), l'initiale pour une personne (`UserAvatar`).
  ///
  /// Toujours la variante **claire** : une extension ne connaît pas le thème de l'appareil
  /// au moment où elle prépare la notification.
  private func fallbackAvatar(name: String, isGroup: Bool) -> Data? {
    isGroup ? groupAvatar() : initialsAvatar(for: name)
  }

  private func initialsAvatar(for name: String) -> Data? {
    let letter = String(name.trimmingCharacters(in: .whitespaces).first ?? "?").uppercased()
    return circleAvatar { side in
      let attributes: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: side * 0.4, weight: .bold),
        .foregroundColor: Self.nexa,
      ]
      let box = letter.size(withAttributes: attributes)
      letter.draw(
        at: CGPoint(x: (side - box.width) / 2, y: (side - box.height) / 2),
        withAttributes: attributes
      )
    }
  }

  private func groupAvatar() -> Data? {
    circleAvatar { side in
      let configuration = UIImage.SymbolConfiguration(pointSize: side * 0.42, weight: .semibold)
      guard
        let symbol = UIImage(systemName: "person.2.fill", withConfiguration: configuration)?
          .withTintColor(Self.nexa, renderingMode: .alwaysOriginal)
      else { return }
      symbol.draw(
        in: CGRect(
          x: (side - symbol.size.width) / 2,
          y: (side - symbol.size.height) / 2,
          width: symbol.size.width,
          height: symbol.size.height
        )
      )
    }
  }

  /// Pastille ronde aux couleurs de l'app, sur fond transparent : iOS applique de toute
  /// façon son propre masque circulaire.
  private func circleAvatar(_ drawContent: (CGFloat) -> Void) -> Data? {
    let side = Self.avatarSide
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side))
    let image = renderer.image { context in
      Self.circleBackground.setFill()
      context.cgContext.fillEllipse(in: CGRect(x: 0, y: 0, width: side, height: side))
      drawContent(side)
    }
    return image.pngData()
  }

  // MARK: - Mise en forme « conversation »

  /// `senderName` non nul ⇒ message de groupe : c'est le groupe qui porte le nom et la
  /// photo affichés (l'`INPerson` de l'intention le représente donc lui, pas l'expéditeur),
  /// tandis que l'expéditeur reste dans le sous-titre posé plus haut.
  private func decorate(
    _ content: UNMutableNotificationContent,
    photo: Data?,
    name: String,
    senderName: String?,
    conversationId: String?
  ) -> UNNotificationContent {
    let image = photo.map { INImage(imageData: $0) }
    let intent: INSendMessageIntent

    if let senderName {
      // Groupe → « nom du groupe / expéditeur / message ». Les deux premières lignes sont
      // composées par le SYSTÈME : un `subtitle` posé à la main est ignoré dès qu'une
      // intention est appliquée.
      //
      // ⚠️ Les rôles sont VOLONTAIREMENT inversés : à l'usage (vérifié sur iPhone le
      // 1er août 2026), iOS met le nom du `sender` en **titre** et le `speakableGroupName`
      // en **sous-titre** — l'inverse de ce qu'indique la documentation communautaire.
      // Pour obtenir « groupe » puis « personne », on passe donc le groupe comme
      // expéditeur et l'expéditeur comme nom de groupe. Ne pas « corriger » sans
      // revérifier le rendu sur un appareil.
      //
      // Reste nécessaire : **plusieurs** `recipients`. Avec `nil` ou un seul, iOS ne
      // traite pas la conversation comme un groupe et ignore la seconde ligne.
      let groupAsSender = person(named: name, handle: conversationId ?? name, image: image)
      let sender = person(named: senderName, handle: senderName)
      intent = INSendMessageIntent(
        recipients: [groupAsSender, sender],
        outgoingMessageType: .outgoingMessageText,
        content: content.body,
        speakableGroupName: INSpeakableString(spokenPhrase: senderName),
        conversationIdentifier: conversationId,
        serviceName: nil,
        sender: groupAsSender,
        attachments: nil
      )
      // Posée aux deux endroits : c'est la photo du groupe dans les deux cas, et cela
      // évite de dépendre de celui que le système consulte en premier.
      if let image { intent.setImage(image, forParameterNamed: \.speakableGroupName) }
    } else {
      // Conversation directe : le nom de la personne fait le titre, sa photo l'avatar.
      intent = INSendMessageIntent(
        recipients: nil,
        outgoingMessageType: .outgoingMessageText,
        content: content.body,
        speakableGroupName: nil,
        conversationIdentifier: conversationId,
        serviceName: nil,
        sender: person(named: name, handle: conversationId ?? name, image: image),
        attachments: nil
      )
    }

    // Le don de l'interaction sert aussi les suggestions de partage d'iOS (feuille de
    // partage, Siri) : la conversation y remonte comme destination récente.
    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = .incoming
    interaction.donate(completion: nil)

    if let updated = try? content.updating(from: intent) {
      return updated
    }

    // Repli : entitlement absent → la photo devient une vignette (à droite du texte).
    if let photo { attach(photo, to: content) }
    return content
  }

  private func person(named displayName: String, handle: String, image: INImage? = nil) -> INPerson {
    INPerson(
      personHandle: INPersonHandle(value: handle, type: .unknown),
      nameComponents: nil,
      displayName: displayName,
      image: image,
      contactIdentifier: nil,
      // Sans identifiant stable, iOS regrouperait mal les notifications d'un même fil.
      customIdentifier: handle
    )
  }

  /// Écrit l'image dans un fichier temporaire — une pièce jointe se réfère à une URL,
  /// pas à des données en mémoire.
  private func attach(_ data: Data, to content: UNMutableNotificationContent) {
    // iOS déduit le type de la pièce jointe de l'extension du fichier : la deviner d'après
    // les premiers octets évite qu'une photo JPEG écrite en « .png » soit rejetée — l'avatar
    // dessiné, lui, est toujours un PNG.
    let ext = data.starts(with: [0xFF, 0xD8]) ? "jpg" : "png"
    let file = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent(UUID().uuidString + "." + ext)
    guard
      (try? data.write(to: file)) != nil,
      let attachment = try? UNNotificationAttachment(identifier: "avatar", url: file, options: nil)
    else { return }
    content.attachments = [attachment]
  }

  override func serviceExtensionTimeWillExpire() {
    if let content = bestAttempt {
      deliver(content)
    }
  }
}
