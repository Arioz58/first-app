import ExpoModulesCore
import UIKit

/**
 * Temps d'exécution en arrière-plan — `UIApplication.beginBackgroundTask`.
 *
 * Pourquoi (26/09) : répondre depuis une notification réveille l'app en arrière-plan, et
 * `expo-notifications` rend la main à iOS (`completionHandler()`) AVANT que notre JavaScript
 * ait envoyé la réponse. iOS gèle alors l'app en une centaine de millisecondes. Mesuré dans
 * les logs Railway : la requête arrive au serveur, puis le téléphone ferme la connexion
 * (`499 client has closed the request`, à 77 et 132 ms) — le message part, mais l'app ne
 * reçoit jamais la réponse et affiche « Message non envoyé » à tort.
 *
 * `beginBackgroundTask` est le mécanisme prévu par Apple pour ce cas : l'app garde de quoi
 * finir un travail court (de l'ordre de 30 s), même en arrière-plan. On le demande avant
 * l'envoi et on le rend dès que c'est fini.
 *
 * ⚠️ Toujours rendre la main (`end`) : une tâche non terminée à l'échéance fait tuer l'app
 * par iOS. D'où le gestionnaire d'expiration, qui la termine de lui-même en dernier recours.
 */
public class BackgroundTimeModule: Module {
  private var tasks: [String: UIBackgroundTaskIdentifier] = [:]
  private let lock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("BackgroundTime")

    /// Commence une tâche ; renvoie son identifiant (vide si iOS refuse).
    AsyncFunction("begin") { (name: String) -> String in
      let key = UUID().uuidString
      var id: UIBackgroundTaskIdentifier = .invalid
      id = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
        // Échéance atteinte : on rend la main nous-mêmes, sinon iOS tue l'app.
        self?.finish(key)
      }
      if id == .invalid { return "" }
      self.lock.lock()
      self.tasks[key] = id
      self.lock.unlock()
      return key
    }.runOnQueue(.main)

    /// Termine la tâche. Sans effet si elle l'est déjà (échéance, double appel).
    AsyncFunction("end") { (key: String) in
      self.finish(key)
    }.runOnQueue(.main)
  }

  private func finish(_ key: String) {
    lock.lock()
    let id = tasks.removeValue(forKey: key)
    lock.unlock()
    if let id, id != .invalid {
      UIApplication.shared.endBackgroundTask(id)
    }
  }
}
