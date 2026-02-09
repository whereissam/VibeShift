#[test_only]
#[allow(unused_mut_ref)]
module vibeshift::vault_tests;

use sui::test_scenario::{Self as ts, Scenario};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use vibeshift::vault::{Self, Vault, AgentCap, AdminCap};

const ADMIN: address = @0xAD;
const USER1: address = @0xA1;
const USER2: address = @0xA2;
const AGENT: address = @0xAD; // Same as admin for tests (init sends to deployer)

// ===== Helpers =====

fun setup(scenario: &mut Scenario) {
    ts::next_tx(scenario, ADMIN);
    {
        vault::init_for_testing(ts::ctx(scenario));
    };
}

fun create_test_vault(scenario: &mut Scenario) {
    ts::next_tx(scenario, ADMIN);
    {
        let admin_cap = ts::take_from_sender<AdminCap>(scenario);
        vault::create_vault<SUI>(&admin_cap, ts::ctx(scenario));
        ts::return_to_sender(scenario, admin_cap);
    };
}

fun mint_test_coin(scenario: &mut Scenario, amount: u64): Coin<SUI> {
    coin::mint_for_testing<SUI>(amount, ts::ctx(scenario))
}

// ===== Tests =====

#[test]
fun test_init_creates_caps() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);

    // Admin should have both caps
    ts::next_tx(&mut scenario, ADMIN);
    {
        assert!(ts::has_most_recent_for_sender<AgentCap>(&scenario));
        assert!(ts::has_most_recent_for_sender<AdminCap>(&scenario));
    };

    ts::end(scenario);
}

#[test]
fun test_create_vault() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);
    create_test_vault(&mut scenario);

    // Vault should exist as a shared object
    ts::next_tx(&mut scenario, USER1);
    {
        let vault = ts::take_shared<Vault<SUI>>(&scenario);
        assert!(vault::vault_balance(&vault) == 0);
        assert!(vault::vault_lp_supply(&vault) == 0);
        ts::return_shared(vault);
    };

    ts::end(scenario);
}

#[test]
fun test_deposit() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);
    create_test_vault(&mut scenario);

    // User1 deposits 1000
    ts::next_tx(&mut scenario, USER1);
    {
        let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
        let coin = mint_test_coin(&mut scenario, 1000);
        vault::deposit(&mut vault, coin, ts::ctx(&mut scenario));

        assert!(vault::vault_balance(&vault) == 1000);
        assert!(vault::vault_lp_supply(&vault) == 1000);
        ts::return_shared(vault);
    };

    ts::end(scenario);
}

#[test]
fun test_multiple_deposits() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);
    create_test_vault(&mut scenario);

    // User1 deposits 1000
    ts::next_tx(&mut scenario, USER1);
    {
        let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
        let coin = mint_test_coin(&mut scenario, 1000);
        vault::deposit(&mut vault, coin, ts::ctx(&mut scenario));
        ts::return_shared(vault);
    };

    // User2 deposits 500
    ts::next_tx(&mut scenario, USER2);
    {
        let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
        let coin = mint_test_coin(&mut scenario, 500);
        vault::deposit(&mut vault, coin, ts::ctx(&mut scenario));

        assert!(vault::vault_balance(&vault) == 1500);
        assert!(vault::vault_lp_supply(&vault) == 1500);
        ts::return_shared(vault);
    };

    ts::end(scenario);
}

#[test]
fun test_withdraw() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);
    create_test_vault(&mut scenario);

    // Deposit 1000
    ts::next_tx(&mut scenario, USER1);
    {
        let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
        let coin = mint_test_coin(&mut scenario, 1000);
        vault::deposit(&mut vault, coin, ts::ctx(&mut scenario));
        ts::return_shared(vault);
    };

    // Withdraw 400
    ts::next_tx(&mut scenario, USER1);
    {
        let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
        vault::withdraw(&mut vault, 400, ts::ctx(&mut scenario));

        assert!(vault::vault_balance(&vault) == 600);
        assert!(vault::vault_lp_supply(&vault) == 600);
        ts::return_shared(vault);
    };

    // Check user received the coin
    ts::next_tx(&mut scenario, USER1);
    {
        let coin = ts::take_from_sender<Coin<SUI>>(&scenario);
        assert!(coin::value(&coin) == 400);
        ts::return_to_sender(&mut scenario, coin);
    };

    ts::end(scenario);
}

#[test]
fun test_withdraw_all() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);
    create_test_vault(&mut scenario);

    // Deposit 1000
    ts::next_tx(&mut scenario, USER1);
    {
        let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
        let coin = mint_test_coin(&mut scenario, 1000);
        vault::deposit(&mut vault, coin, ts::ctx(&mut scenario));
        ts::return_shared(vault);
    };

    // Withdraw all
    ts::next_tx(&mut scenario, USER1);
    {
        let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
        vault::withdraw(&mut vault, 1000, ts::ctx(&mut scenario));

        assert!(vault::vault_balance(&vault) == 0);
        assert!(vault::vault_lp_supply(&vault) == 0);
        ts::return_shared(vault);
    };

    ts::end(scenario);
}

#[test]
fun test_rebalance_to_protocol() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);
    create_test_vault(&mut scenario);

    // Deposit 1000
    ts::next_tx(&mut scenario, USER1);
    {
        let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
        let coin = mint_test_coin(&mut scenario, 1000);
        vault::deposit(&mut vault, coin, ts::ctx(&mut scenario));
        ts::return_shared(vault);
    };

    // Agent rebalances 400 to a protocol address
    ts::next_tx(&mut scenario, AGENT);
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        let mut vault = ts::take_shared<Vault<SUI>>(&scenario);

        vault::rebalance_to_protocol(
            &agent_cap,
            &mut vault,
            400,
            b"to_cetus",
            @0xCE,
            ts::ctx(&mut scenario),
        );

        assert!(vault::vault_balance(&vault) == 600);
        // LP supply stays the same - assets are still "in the vault" conceptually
        assert!(vault::vault_lp_supply(&vault) == 1000);

        ts::return_shared(vault);
        ts::return_to_sender(&mut scenario, agent_cap);
    };

    // Verify recipient got the funds
    ts::next_tx(&mut scenario, @0xCE);
    {
        let coin = ts::take_from_sender<Coin<SUI>>(&scenario);
        assert!(coin::value(&coin) == 400);
        ts::return_to_sender(&mut scenario, coin);
    };

    ts::end(scenario);
}

#[test]
fun test_receive_from_protocol() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);
    create_test_vault(&mut scenario);

    // Deposit 1000
    ts::next_tx(&mut scenario, USER1);
    {
        let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
        let coin = mint_test_coin(&mut scenario, 1000);
        vault::deposit(&mut vault, coin, ts::ctx(&mut scenario));
        ts::return_shared(vault);
    };

    // Simulate receiving funds back from protocol (with yield: 1050 back on 1000)
    ts::next_tx(&mut scenario, AGENT);
    {
        let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
        let coin = mint_test_coin(&mut scenario, 1050);
        vault::receive_from_protocol(&mut vault, coin);

        // Total assets = original 1000 + 1050 received back
        assert!(vault::vault_balance(&vault) == 2050);
        ts::return_shared(vault);
    };

    ts::end(scenario);
}

#[test, expected_failure(abort_code = vault::EZeroAmount)]
fun test_deposit_zero_fails() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);
    create_test_vault(&mut scenario);

    ts::next_tx(&mut scenario, USER1);
    {
        let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
        let coin = mint_test_coin(&mut scenario, 0);
        vault::deposit(&mut vault, coin, ts::ctx(&mut scenario));
        ts::return_shared(vault);
    };

    ts::end(scenario);
}

#[test, expected_failure(abort_code = vault::EZeroAmount)]
fun test_withdraw_zero_fails() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);
    create_test_vault(&mut scenario);

    ts::next_tx(&mut scenario, USER1);
    {
        let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
        let coin = mint_test_coin(&mut scenario, 1000);
        vault::deposit(&mut vault, coin, ts::ctx(&mut scenario));
        ts::return_shared(vault);
    };

    ts::next_tx(&mut scenario, USER1);
    {
        let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
        vault::withdraw(&mut vault, 0, ts::ctx(&mut scenario));
        ts::return_shared(vault);
    };

    ts::end(scenario);
}

#[test, expected_failure(abort_code = vault::EExceedsBalance)]
fun test_withdraw_exceeds_balance_fails() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);
    create_test_vault(&mut scenario);

    ts::next_tx(&mut scenario, USER1);
    {
        let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
        let coin = mint_test_coin(&mut scenario, 1000);
        vault::deposit(&mut vault, coin, ts::ctx(&mut scenario));
        ts::return_shared(vault);
    };

    ts::next_tx(&mut scenario, USER1);
    {
        let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
        vault::withdraw(&mut vault, 2000, ts::ctx(&mut scenario));
        ts::return_shared(vault);
    };

    ts::end(scenario);
}

#[test, expected_failure(abort_code = vault::EExceedsBalance)]
fun test_rebalance_exceeds_balance_fails() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);
    create_test_vault(&mut scenario);

    ts::next_tx(&mut scenario, USER1);
    {
        let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
        let coin = mint_test_coin(&mut scenario, 1000);
        vault::deposit(&mut vault, coin, ts::ctx(&mut scenario));
        ts::return_shared(vault);
    };

    ts::next_tx(&mut scenario, AGENT);
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        let mut vault = ts::take_shared<Vault<SUI>>(&scenario);

        vault::rebalance_to_protocol(
            &agent_cap,
            &mut vault,
            2000,
            b"to_cetus",
            @0xCE,
            ts::ctx(&mut scenario),
        );

        ts::return_shared(vault);
        ts::return_to_sender(&mut scenario, agent_cap);
    };

    ts::end(scenario);
}

#[test]
fun test_transfer_agent_cap() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);

    // Transfer AgentCap to a new agent
    ts::next_tx(&mut scenario, ADMIN);
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        vault::transfer_agent_cap(agent_cap, @0xB0B);
    };

    // New agent should have the cap
    ts::next_tx(&mut scenario, @0xB0B);
    {
        assert!(ts::has_most_recent_for_sender<AgentCap>(&scenario));
    };

    ts::end(scenario);
}
