/**
 * Valeurs de mise en page partagées.
 *
 * ⚠️ Ici et non dans un écran : la même valeur était déjà écrite dans deux fichiers, et le
 * défaut qu'elle corrige s'est révélé présent dans cinq.
 */

/**
 * Dégagement à réserver en BAS de tout contenu défilant d'un onglet.
 *
 * ⚠️ POURQUOI C'EST NÉCESSAIRE : la tab bar native FLOTTE au-dessus du contenu, et
 * `SafeAreaView` ne la connaît pas — les écrans excluent volontairement le bord bas de leurs
 * `edges`. Sans ce retrait, le dernier élément d'une liste passe SOUS la pilule et rien ne
 * permet d'aller le chercher : la page est déjà au bout de son défilement. C'est ce qui rendait
 * « Se déconnecter » introuvable dans le Profil (signalé par le client le 15/09).
 *
 * ⚠️ UNE CONSTANTE, faute de mieux : `expo-router/unstable-native-tabs` n'expose aucun hook de
 * hauteur. Mesuré au simulateur (iPhone 17 Pro, iOS 26) : la pilule flottante a son sommet à
 * ~81 pt du bas de l'écran. 96 laisse donc une quinzaine de points entre elle et le contenu.
 *
 * ⚠️ Sert AUSSI à positionner le bouton flottant de l'onglet Discussion (`bottom`) : c'est la
 * même barre à dégager, et deux valeurs séparées finiraient par diverger.
 *
 * ⚠️ Généreux plutôt que juste : en réserver trop n'ajoute qu'un peu de vide en fin de liste,
 * en réserver trop peu rend un élément inatteignable.
 */
export const TAB_BAR_CLEARANCE = 96;
