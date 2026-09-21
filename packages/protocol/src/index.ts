export {
  PROTOCOL_VERSION,
  ENVELOPE_DIRECTIONS,
  envelopeDirectionSchema,
  pairingIdSchema,
  nonceSchema,
  tagSchema,
  ciphertextSchema,
  envelopeSchema,
  EnvelopeError,
  parseEnvelope,
  ReplayGuard,
} from './envelope';
export type { Envelope, EnvelopeDirection } from './envelope';

export {
  pairingPayloadSchema,
  pairingRequestSchema,
  sealedBlobSchema,
  x25519PublicKeySchema,
  pairingCompleteResponseSchema,
  PairingError,
  parsePairingPayload,
  parsePairingRequest,
  parsePairingCompleteResponse,
} from './pairing';
export type {
  PairingPayload,
  PairingRequest,
  PairingCompleteResponse,
  ParsePairingOptions,
} from './pairing';

export {
  ALLOWED_EVENT_NAMES,
  allowedEventNameSchema,
  isAllowedEvent,
  normalizeEvent,
} from './events';
export type { AllowedEventName, NormalizedEvent } from './events';

export {
  PERMISSION_DECISIONS,
  permissionDecisionSchema,
  actionSchema,
  ActionError,
  parseAction,
} from './actions';
export type { Action, ActionType, PermissionDecision } from './actions';

export {
  GCM_KEY_LENGTH,
  GCM_NONCE_LENGTH,
  GCM_TAG_LENGTH,
  X25519_KEY_LENGTH,
  SESSION_KEY_LENGTH,
  AAD_DELIMITER,
  TRANSCRIPT_FIELD_SEPARATOR,
  PAIRING_KEY_INFO,
  SESSION_KEY_INFO,
  encodeUtf8,
  concatBytes,
  buildAad,
  buildTranscript,
  derivePairingKey,
  deriveSessionKey,
  buildPairingProof,
} from './crypto';
export type {
  Bytes,
  CiphertextBlob,
  EncryptParams,
  DecryptParams,
  CryptoAdapter,
  AadInput,
  X25519KeyPair,
  KeyAgreementAdapter,
  HkdfParams,
  KeyDerivationAdapter,
  HashAdapter,
  TranscriptInput,
  PairingKeyParams,
  SessionKeyParams,
  PairingProofParams,
} from './crypto';
