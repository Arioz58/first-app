package expo.modules.backgroundtime

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Pendant Android de `BackgroundTimeModule` (iOS) — SANS EFFET pour l'instant (26/09).
 *
 * Android ne suspend pas une app comme iOS le fait après une action de notification, mais
 * depuis Android 11 il GÈLE les processus en arrière-plan mis en cache (« cached apps
 * freezer ») : le même symptôme reste possible. Non vérifié faute d'appareil — voir
 * `android.md`. S'il se confirme, c'est ICI que se fera la protection (tâche WorkManager
 * « expedited » ou service de premier plan court), sans changer l'interface JavaScript.
 */
class BackgroundTimeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BackgroundTime")

    AsyncFunction("begin") { _: String -> "" }

    AsyncFunction("end") { _: String -> }
  }
}
