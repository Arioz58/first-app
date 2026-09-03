import * as Contacts from 'expo-contacts';
import { deviceRegion } from './countries';
import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js';
import { apiRequest } from './api';

export type RelationStatus = 'self' | 'friends' | 'request_sent' | 'request_received' | 'none';

// Un contact du carnet qui a un compte Nexa (enrichi par le serveur, gated).
export type NexaContact = {
  id: string;
  name: string; // nom du profil Nexa
  contactName: string; // nom tel qu'enregistré dans le carnet (prioritaire à l'affichage)
  phone: string;
  photoUrl: string | null;
  relationStatus: RelationStatus;
};

// Un contact du carnet sans compte Nexa (à inviter — étape 2).
export type OtherContact = { name: string; phone: string };

export type SyncResult =
  | { granted: false }
  | { granted: true; onNexa: NexaContact[]; others: OtherContact[] };

type ServerCard = {
  id: string;
  name: string;
  phone: string;
  photoUrl: string | null;
  relationStatus: RelationStatus;
};

// Pays par défaut pour interpréter les numéros locaux du carnet (« 0532… » → « +90532… »).
// ⚠️ Même source que le pré-remplissage du sélecteur à l'inscription (`lib/countries.ts`) :
// deux règles distinctes finiraient par diverger, et un numéro serait alors interprété dans
// une région différente de celle affichée à l'utilisateur.
const defaultRegion = () => deviceRegion() as CountryCode;

export const getContactsPermission = () => Contacts.getPermissionsAsync();

// Cache mémoire du dernier résultat (affichage instantané au retour sur l'onglet,
// et surtout : évite de re-synchroniser à chaque bascule de segment → rate-limit).
let cached: SyncResult | null = null;
export const getCachedSync = (): SyncResult | null => cached;

// Demande la permission, lit le carnet, normalise en E.164 et confronte au serveur.
// Aucun numéro n'est conservé côté serveur (match en mémoire).
export const requestAndSyncContacts = async (): Promise<SyncResult> => {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== 'granted') return { granted: false };

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
  });

  const region = defaultRegion();
  const nameByPhone = new Map<string, string>(); // E.164 → nom du carnet
  for (const c of data) {
    if (!c.phoneNumbers) continue;
    for (const pn of c.phoneNumbers) {
      const parsed = pn.number ? parsePhoneNumberFromString(pn.number, region) : undefined;
      if (parsed?.isValid()) {
        const e164 = parsed.number;
        if (!nameByPhone.has(e164)) nameByPhone.set(e164, c.name || parsed.formatInternational());
      }
    }
  }

  const phones = [...nameByPhone.keys()];
  if (phones.length === 0) return { granted: true, onNexa: [], others: [] };

  const { matches } = await apiRequest<{ matches: ServerCard[] }>('/users/contacts/match', {
    method: 'POST',
    body: { phones },
  });

  const onNexaPhones = new Set(matches.map((m) => m.phone));
  const onNexa: NexaContact[] = matches
    .map((m) => ({ ...m, contactName: nameByPhone.get(m.phone) ?? m.name }))
    .sort((a, b) => a.contactName.localeCompare(b.contactName));

  const others: OtherContact[] = [...nameByPhone.entries()]
    .filter(([e164]) => !onNexaPhones.has(e164))
    .map(([phone, name]) => ({ phone, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  cached = { granted: true, onNexa, others };
  return cached;
};
