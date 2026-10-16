/// PTB helpers (no Cetus types).
module crewpay_launchpad::migration_helpers;

use sui::object;

public fun object_id<P: key>(obj: &P): ID {
    object::id(obj)
}
