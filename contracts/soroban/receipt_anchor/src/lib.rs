#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, String};

#[contracttype]
#[derive(Clone)]
pub struct ReceiptRecord {
    pub verifier: Address,
    pub task_id_hash: BytesN<32>,
    pub trace_root: BytesN<32>,
    pub proof_ref: String,
    pub anchored_ledger: u32,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Receipt(BytesN<32>),
}

#[contract]
pub struct ReceiptAnchor;

#[contractimpl]
impl ReceiptAnchor {
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn anchor_receipt(
        env: Env,
        verifier: Address,
        receipt_hash: BytesN<32>,
        task_id_hash: BytesN<32>,
        trace_root: BytesN<32>,
        proof_ref: String,
    ) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();
        verifier.require_auth();

        let key = DataKey::Receipt(receipt_hash.clone());
        if env.storage().persistent().has(&key) {
            panic!("receipt already anchored");
        }

        let record = ReceiptRecord {
            verifier: verifier.clone(),
            task_id_hash: task_id_hash.clone(),
            trace_root: trace_root.clone(),
            proof_ref: proof_ref.clone(),
            anchored_ledger: env.ledger().sequence(),
        };

        env.storage().persistent().set(&key, &record);
        env.events().publish(
            (String::from_str(&env, "receipt_anchored"), verifier),
            (receipt_hash, task_id_hash, trace_root, proof_ref),
        );
    }

    pub fn get_receipt(env: Env, receipt_hash: BytesN<32>) -> Option<ReceiptRecord> {
        env.storage().persistent().get(&DataKey::Receipt(receipt_hash))
    }

    /// Returns true if a receipt with this hash has been anchored.
    pub fn is_anchored(env: Env, receipt_hash: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::Receipt(receipt_hash))
    }
}
