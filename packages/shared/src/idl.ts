// Generated from target/idl/wick.json by scripts/sync-idl.ts.
export const WICK_IDL = {
  "address": "GY2WTMTTpSh3xBaf1HYGP5PDic5vjA5wucJdTci92GL8",
  "metadata": {
    "name": "wick",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Wick leveraged synthetic Gemini prediction markets on Solana devnet"
  },
  "instructions": [
    {
      "name": "claim_queue",
      "discriminator": [
        118,
        116,
        6,
        82,
        230,
        129,
        91,
        42
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "lp",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "usdc_mint"
        },
        {
          "name": "claim",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  97,
                  105,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "claim.index",
                "account": "PayoutClaim"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true
        },
        {
          "name": "owner_usdc",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdc_mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associated_token_program",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "claim_rewards",
      "discriminator": [
        4,
        144,
        132,
        71,
        116,
        23,
        151,
        80
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "stake_account"
          ]
        },
        {
          "name": "lp",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "usdc_mint"
        },
        {
          "name": "owner_usdc",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdc_mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "stake_account",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "close_position",
      "discriminator": [
        123,
        134,
        81,
        0,
        49,
        68,
        98,
        98
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "lp",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "usdc_mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "owner_usdc",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdc_mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "loser_mint",
          "writable": true,
          "relations": [
            "lp"
          ]
        },
        {
          "name": "owner_wicked",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "loser_mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "claim",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  97,
                  105,
                  109
                ]
              },
              {
                "kind": "arg",
                "path": "claim_index"
              }
            ]
          }
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associated_token_program",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "min_exit_e6",
          "type": "u32"
        },
        {
          "name": "claim_index",
          "type": "u64"
        }
      ]
    },
    {
      "name": "create_market",
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "keeper",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "symbol_hash"
              }
            ]
          }
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "symbol",
          "type": "string"
        },
        {
          "name": "symbol_hash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "kind",
          "type": {
            "defined": {
              "name": "MarketKind"
            }
          }
        },
        {
          "name": "strike_usd_e6",
          "type": "u64"
        },
        {
          "name": "open_ts",
          "type": "i64"
        },
        {
          "name": "expiry_ts",
          "type": "i64"
        },
        {
          "name": "cutoff_secs",
          "type": "u32"
        },
        {
          "name": "half_spread_e6",
          "type": "u32"
        }
      ]
    },
    {
      "name": "init_config",
      "discriminator": [
        23,
        235,
        115,
        232,
        168,
        96,
        1,
        231
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "lp",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112
                ]
              }
            ]
          }
        },
        {
          "name": "usdc_mint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "loser_mint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  99,
                  107,
                  101,
                  100
                ]
              }
            ]
          }
        },
        {
          "name": "staking_vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  105,
                  110,
                  103,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "InitConfigParams"
            }
          }
        }
      ]
    },
    {
      "name": "liquidate",
      "discriminator": [
        223,
        179,
        226,
        125,
        48,
        46,
        39,
        74
      ],
      "accounts": [
        {
          "name": "liquidator",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "owner",
          "writable": true
        },
        {
          "name": "lp",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112
                ]
              }
            ]
          }
        },
        {
          "name": "loser_mint",
          "writable": true,
          "relations": [
            "lp"
          ]
        },
        {
          "name": "owner_wicked",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "loser_mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associated_token_program",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "migrate_lp",
      "docs": [
        "Reallocates a legacy LP PDA after the deferred-reward cursor was",
        "appended. Existing bytes and field offsets are preserved, and the new",
        "cursor is zero-initialized."
      ],
      "discriminator": [
        27,
        223,
        110,
        58,
        196,
        168,
        198,
        187
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "lp",
          "docs": [
            "legacy/current length before reallocating the canonical LP PDA."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112
                ]
              }
            ]
          }
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "open_position",
      "discriminator": [
        135,
        128,
        47,
        77,
        15,
        152,
        240,
        49
      ],
      "accounts": [
        {
          "name": "trader",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "lp",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "usdc_mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "trader_usdc",
          "writable": true
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "Side"
            }
          }
        },
        {
          "name": "margin",
          "type": "u64"
        },
        {
          "name": "leverage",
          "type": "u16"
        },
        {
          "name": "max_entry_e6",
          "type": "u32"
        },
        {
          "name": "nonce",
          "type": "u64"
        }
      ]
    },
    {
      "name": "set_keeper",
      "discriminator": [
        102,
        94,
        23,
        78,
        157,
        222,
        243,
        214
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "keeper",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "set_params",
      "discriminator": [
        27,
        234,
        178,
        52,
        147,
        2,
        187,
        141
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "MutableParams"
            }
          }
        }
      ]
    },
    {
      "name": "set_paused",
      "discriminator": [
        91,
        60,
        125,
        192,
        176,
        225,
        166,
        218
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "settle_market",
      "discriminator": [
        193,
        153,
        95,
        216,
        166,
        6,
        144,
        217
      ],
      "accounts": [
        {
          "name": "keeper",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "outcome",
          "type": {
            "defined": {
              "name": "Outcome"
            }
          }
        },
        {
          "name": "settlement_value_e6",
          "type": "u64"
        }
      ]
    },
    {
      "name": "settle_position",
      "discriminator": [
        33,
        156,
        74,
        218,
        215,
        42,
        112,
        175
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "owner",
          "writable": true
        },
        {
          "name": "lp",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "usdc_mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "owner_usdc",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdc_mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "loser_mint",
          "writable": true,
          "relations": [
            "lp"
          ]
        },
        {
          "name": "owner_wicked",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "loser_mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "claim",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  97,
                  105,
                  109
                ]
              },
              {
                "kind": "arg",
                "path": "claim_index"
              }
            ]
          }
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associated_token_program",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "claim_index",
          "type": "u64"
        }
      ]
    },
    {
      "name": "stake",
      "discriminator": [
        206,
        176,
        202,
        18,
        200,
        209,
        179,
        108
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "lp",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112
                ]
              }
            ]
          }
        },
        {
          "name": "loser_mint",
          "writable": true,
          "relations": [
            "lp"
          ]
        },
        {
          "name": "owner_wicked",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "loser_mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "staking_vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  105,
                  110,
                  103,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "stake_account",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "unstake",
      "discriminator": [
        90,
        95,
        107,
        42,
        205,
        124,
        50,
        225
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "lp",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112
                ]
              }
            ]
          }
        },
        {
          "name": "loser_mint",
          "writable": true,
          "relations": [
            "lp"
          ]
        },
        {
          "name": "owner_wicked",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "loser_mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "staking_vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  105,
                  110,
                  103,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "stake_account",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "update_marks",
      "discriminator": [
        189,
        221,
        191,
        240,
        199,
        45,
        235,
        138
      ],
      "accounts": [
        {
          "name": "keeper",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "updates",
          "type": {
            "vec": {
              "defined": {
                "name": "MarkUpdate"
              }
            }
          }
        }
      ]
    },
    {
      "name": "verify_math_vectors",
      "docs": [
        "Checks deterministic TypeScript pricing vectors inside the deployed",
        "program. This mutates no accounts and is compute-bounded per call."
      ],
      "discriminator": [
        29,
        115,
        38,
        201,
        12,
        119,
        232,
        63
      ],
      "accounts": [],
      "args": [
        {
          "name": "seed",
          "type": "u64"
        },
        {
          "name": "count",
          "type": "u16"
        },
        {
          "name": "expected",
          "type": {
            "array": [
              "u64",
              4
            ]
          }
        }
      ]
    },
    {
      "name": "void_market",
      "discriminator": [
        243,
        175,
        46,
        124,
        95,
        101,
        39,
        69
      ],
      "accounts": [
        {
          "name": "keeper",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "Config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "LpState",
      "discriminator": [
        181,
        181,
        90,
        8,
        24,
        61,
        173,
        189
      ]
    },
    {
      "name": "Market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "PayoutClaim",
      "discriminator": [
        237,
        161,
        204,
        160,
        41,
        151,
        227,
        6
      ]
    },
    {
      "name": "Position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    },
    {
      "name": "StakeAccount",
      "discriminator": [
        80,
        158,
        67,
        124,
        50,
        189,
        192,
        255
      ]
    }
  ],
  "events": [
    {
      "name": "ClaimPaid",
      "discriminator": [
        212,
        155,
        88,
        118,
        128,
        99,
        132,
        42
      ]
    },
    {
      "name": "ClaimQueued",
      "discriminator": [
        150,
        147,
        186,
        188,
        101,
        196,
        182,
        225
      ]
    },
    {
      "name": "ConfigInitialized",
      "discriminator": [
        181,
        49,
        200,
        156,
        19,
        167,
        178,
        91
      ]
    },
    {
      "name": "KeeperUpdated",
      "discriminator": [
        66,
        246,
        222,
        123,
        98,
        93,
        174,
        230
      ]
    },
    {
      "name": "LpMigrated",
      "discriminator": [
        84,
        147,
        58,
        191,
        145,
        215,
        27,
        35
      ]
    },
    {
      "name": "LpUpdated",
      "discriminator": [
        7,
        235,
        21,
        229,
        36,
        1,
        216,
        31
      ]
    },
    {
      "name": "MarketCreated",
      "discriminator": [
        88,
        184,
        130,
        231,
        226,
        84,
        6,
        58
      ]
    },
    {
      "name": "MarketSettled",
      "discriminator": [
        237,
        212,
        22,
        175,
        201,
        117,
        215,
        99
      ]
    },
    {
      "name": "MarketVoided",
      "discriminator": [
        217,
        12,
        138,
        39,
        108,
        75,
        89,
        26
      ]
    },
    {
      "name": "MarksUpdated",
      "discriminator": [
        104,
        222,
        197,
        150,
        128,
        181,
        228,
        141
      ]
    },
    {
      "name": "MathVectorsVerified",
      "discriminator": [
        211,
        208,
        17,
        90,
        229,
        67,
        203,
        18
      ]
    },
    {
      "name": "ParamsUpdated",
      "discriminator": [
        2,
        163,
        138,
        99,
        135,
        11,
        136,
        169
      ]
    },
    {
      "name": "PausedUpdated",
      "discriminator": [
        209,
        89,
        200,
        35,
        126,
        183,
        132,
        23
      ]
    },
    {
      "name": "PositionClosed",
      "discriminator": [
        157,
        163,
        227,
        228,
        13,
        97,
        138,
        121
      ]
    },
    {
      "name": "PositionLiquidated",
      "discriminator": [
        40,
        107,
        90,
        214,
        96,
        30,
        61,
        128
      ]
    },
    {
      "name": "PositionOpened",
      "discriminator": [
        237,
        175,
        243,
        230,
        147,
        117,
        101,
        121
      ]
    },
    {
      "name": "PositionSettled",
      "discriminator": [
        75,
        100,
        92,
        189,
        245,
        116,
        252,
        221
      ]
    },
    {
      "name": "RewardsClaimed",
      "discriminator": [
        75,
        98,
        88,
        18,
        219,
        112,
        88,
        121
      ]
    },
    {
      "name": "Staked",
      "discriminator": [
        11,
        146,
        45,
        205,
        230,
        58,
        213,
        240
      ]
    },
    {
      "name": "Unstaked",
      "discriminator": [
        27,
        179,
        156,
        215,
        47,
        71,
        195,
        7
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "Unauthorized",
      "msg": "Unauthorized signer"
    },
    {
      "code": 6001,
      "name": "Paused",
      "msg": "Trading is paused"
    },
    {
      "code": 6002,
      "name": "InvalidParameter",
      "msg": "Invalid parameter"
    },
    {
      "code": 6003,
      "name": "InvalidSymbol",
      "msg": "Invalid Gemini symbol or symbol hash"
    },
    {
      "code": 6004,
      "name": "MarketNotOpen",
      "msg": "Market is not open"
    },
    {
      "code": 6005,
      "name": "MarketCutoff",
      "msg": "Market has reached its trading cutoff"
    },
    {
      "code": 6006,
      "name": "StaleMark",
      "msg": "Market mark is stale"
    },
    {
      "code": 6007,
      "name": "InvalidPrice",
      "msg": "Price is outside the tradable range"
    },
    {
      "code": 6008,
      "name": "LeverageTooHigh",
      "msg": "Leverage exceeds the live market risk cap"
    },
    {
      "code": 6009,
      "name": "SlippageExceeded",
      "msg": "Slippage limit exceeded"
    },
    {
      "code": 6010,
      "name": "PositionNotOpen",
      "msg": "Position is not open"
    },
    {
      "code": 6011,
      "name": "NotLiquidatable",
      "msg": "Position is not liquidatable"
    },
    {
      "code": 6012,
      "name": "MarketNotExpired",
      "msg": "Market has not expired"
    },
    {
      "code": 6013,
      "name": "MarketNotSettled",
      "msg": "Market is not settled or invalid"
    },
    {
      "code": 6014,
      "name": "PoolTooSmall",
      "msg": "Pool too small for this size — lower leverage or margin"
    },
    {
      "code": 6015,
      "name": "MarketExposureExceeded",
      "msg": "Market exposure cap exceeded — lower leverage or margin"
    },
    {
      "code": 6016,
      "name": "ClaimNotAtHead",
      "msg": "Payout claim is not at the queue head"
    },
    {
      "code": 6017,
      "name": "InvalidClaimIndex",
      "msg": "Payout claim index does not match the queue tail"
    },
    {
      "code": 6018,
      "name": "InsufficientFreeVault",
      "msg": "Insufficient free vault balance"
    },
    {
      "code": 6019,
      "name": "MathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6020,
      "name": "NothingToClaim",
      "msg": "Nothing to claim"
    },
    {
      "code": 6021,
      "name": "DeferredRewardsPending",
      "msg": "Staking is locked while rewards await the payout queue"
    }
  ],
  "types": [
    {
      "name": "ClaimPaid",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "claim",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "complete",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "ClaimQueued",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "claim",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "Config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "keeper",
            "type": "pubkey"
          },
          {
            "name": "usdc_mint",
            "type": "pubkey"
          },
          {
            "name": "global_max_leverage",
            "type": "u16"
          },
          {
            "name": "maintenance_bps",
            "type": "u16"
          },
          {
            "name": "profit_fee_bps",
            "type": "u16"
          },
          {
            "name": "liq_fee_bps",
            "type": "u16"
          },
          {
            "name": "max_payout_bps_of_vault",
            "type": "u16"
          },
          {
            "name": "max_market_exposure_bps",
            "type": "u16"
          },
          {
            "name": "liability_allowance",
            "type": "u64"
          },
          {
            "name": "stale_after_secs",
            "type": "u32"
          },
          {
            "name": "emission_threshold",
            "type": "u64"
          },
          {
            "name": "emission_c",
            "type": "u64"
          },
          {
            "name": "staker_cap",
            "type": "u64"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "ConfigInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "keeper",
            "type": "pubkey"
          },
          {
            "name": "usdc_mint",
            "type": "pubkey"
          },
          {
            "name": "loser_mint",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "InitConfigParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "keeper",
            "type": "pubkey"
          },
          {
            "name": "global_max_leverage",
            "type": "u16"
          },
          {
            "name": "maintenance_bps",
            "type": "u16"
          },
          {
            "name": "profit_fee_bps",
            "type": "u16"
          },
          {
            "name": "liq_fee_bps",
            "type": "u16"
          },
          {
            "name": "max_payout_bps_of_vault",
            "type": "u16"
          },
          {
            "name": "max_market_exposure_bps",
            "type": "u16"
          },
          {
            "name": "liability_allowance",
            "type": "u64"
          },
          {
            "name": "stale_after_secs",
            "type": "u32"
          },
          {
            "name": "emission_threshold",
            "type": "u64"
          },
          {
            "name": "emission_c",
            "type": "u64"
          },
          {
            "name": "staker_cap",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "KeeperUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "keeper",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "LpMigrated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "old_len",
            "type": "u32"
          },
          {
            "name": "new_len",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "LpState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "balance",
            "type": "i128"
          },
          {
            "name": "high_watermark",
            "type": "u64"
          },
          {
            "name": "cumulative_losses",
            "type": "u64"
          },
          {
            "name": "fees_stakers",
            "type": "u64"
          },
          {
            "name": "fees_treasury",
            "type": "u64"
          },
          {
            "name": "queue_head",
            "type": "u64"
          },
          {
            "name": "queue_tail",
            "type": "u64"
          },
          {
            "name": "queue_owed",
            "type": "u64"
          },
          {
            "name": "reward_per_token_e12",
            "type": "u128"
          },
          {
            "name": "total_staked",
            "type": "u64"
          },
          {
            "name": "loser_mint",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "undistributed_staker_rewards",
            "docs": [
              "Fee shares accrued while payout claims had priority. Appended to keep",
              "every pre-existing LpState field at its original serialized offset."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "LpUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "balance",
            "type": "i128"
          },
          {
            "name": "queue_owed",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "MarkUpdate",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market_index",
            "type": "u16"
          },
          {
            "name": "mark_e6",
            "type": "u32"
          },
          {
            "name": "max_leverage",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "Market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "symbol_hash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "gemini_symbol",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "symbol_len",
            "type": "u8"
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "MarketKind"
              }
            }
          },
          {
            "name": "strike_usd_e6",
            "type": "u64"
          },
          {
            "name": "open_ts",
            "type": "i64"
          },
          {
            "name": "expiry_ts",
            "type": "i64"
          },
          {
            "name": "cutoff_secs",
            "type": "u32"
          },
          {
            "name": "mark_yes_e6",
            "type": "u32"
          },
          {
            "name": "mark_ts",
            "type": "i64"
          },
          {
            "name": "half_spread_e6",
            "type": "u32"
          },
          {
            "name": "max_leverage",
            "type": "u16"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "MarketStatus"
              }
            }
          },
          {
            "name": "outcome",
            "type": {
              "defined": {
                "name": "Outcome"
              }
            }
          },
          {
            "name": "settlement_value_e6",
            "type": "u64"
          },
          {
            "name": "oi_yes_e6",
            "type": "u64"
          },
          {
            "name": "oi_no_e6",
            "type": "u64"
          },
          {
            "name": "net_liability_usdc",
            "type": "u64"
          },
          {
            "name": "open_positions",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "MarketCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "symbol_hash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "MarketKind"
              }
            }
          },
          {
            "name": "strike_usd_e6",
            "type": "u64"
          },
          {
            "name": "open_ts",
            "type": "i64"
          },
          {
            "name": "expiry_ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "MarketKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "UpDown"
          },
          {
            "name": "Ladder"
          }
        ]
      }
    },
    {
      "name": "MarketSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "type": {
              "defined": {
                "name": "Outcome"
              }
            }
          },
          {
            "name": "settlement_value_e6",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "MarketStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Open"
          },
          {
            "name": "Halted"
          },
          {
            "name": "Expired"
          },
          {
            "name": "Settled"
          },
          {
            "name": "Invalid"
          }
        ]
      }
    },
    {
      "name": "MarketVoided",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "MarksUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "count",
            "type": "u16"
          },
          {
            "name": "slot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "MathVectorsVerified",
      "docs": [
        "Cross-language conformance proof emitted by the read-only vector verifier."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seed",
            "type": "u64"
          },
          {
            "name": "count",
            "type": "u16"
          },
          {
            "name": "accumulators",
            "type": {
              "array": [
                "u64",
                4
              ]
            }
          }
        ]
      }
    },
    {
      "name": "MutableParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "global_max_leverage",
            "type": "u16"
          },
          {
            "name": "maintenance_bps",
            "type": "u16"
          },
          {
            "name": "profit_fee_bps",
            "type": "u16"
          },
          {
            "name": "liq_fee_bps",
            "type": "u16"
          },
          {
            "name": "max_payout_bps_of_vault",
            "type": "u16"
          },
          {
            "name": "max_market_exposure_bps",
            "type": "u16"
          },
          {
            "name": "liability_allowance",
            "type": "u64"
          },
          {
            "name": "stale_after_secs",
            "type": "u32"
          },
          {
            "name": "emission_threshold",
            "type": "u64"
          },
          {
            "name": "emission_c",
            "type": "u64"
          },
          {
            "name": "staker_cap",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "Outcome",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "None"
          },
          {
            "name": "Yes"
          },
          {
            "name": "No"
          }
        ]
      }
    },
    {
      "name": "ParamsUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "PausedUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "PayoutClaim",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "paid",
            "type": "u64"
          },
          {
            "name": "created_ts",
            "type": "i64"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "Position",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "Side"
              }
            }
          },
          {
            "name": "margin",
            "type": "u64"
          },
          {
            "name": "leverage",
            "type": "u16"
          },
          {
            "name": "entry_e6",
            "type": "u32"
          },
          {
            "name": "contracts_e6",
            "type": "u64"
          },
          {
            "name": "liq_mark_e6",
            "type": "u32"
          },
          {
            "name": "opened_ts",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "PositionStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "PositionClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "exit_e6",
            "type": "u32"
          },
          {
            "name": "pnl_e6",
            "type": "i128"
          },
          {
            "name": "fee_e6",
            "type": "u64"
          },
          {
            "name": "paid_e6",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "PositionLiquidated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "margin_e6",
            "type": "u64"
          },
          {
            "name": "liq_fee_e6",
            "type": "u64"
          },
          {
            "name": "wicked_minted_e6",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "PositionOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "Side"
              }
            }
          },
          {
            "name": "margin",
            "type": "u64"
          },
          {
            "name": "leverage",
            "type": "u16"
          },
          {
            "name": "entry_e6",
            "type": "u32"
          },
          {
            "name": "contracts_e6",
            "type": "u64"
          },
          {
            "name": "liq_mark_e6",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "PositionSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "type": {
              "defined": {
                "name": "Outcome"
              }
            }
          },
          {
            "name": "pnl_e6",
            "type": "i128"
          },
          {
            "name": "fee_e6",
            "type": "u64"
          },
          {
            "name": "paid_e6",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "PositionStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Open"
          },
          {
            "name": "Closed"
          },
          {
            "name": "Liquidated"
          },
          {
            "name": "Settled"
          }
        ]
      }
    },
    {
      "name": "RewardsClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "Side",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Yes"
          },
          {
            "name": "No"
          }
        ]
      }
    },
    {
      "name": "StakeAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "reward_debt_e12",
            "type": "u128"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "Staked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "total",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "Unstaked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "total",
            "type": "u64"
          }
        ]
      }
    }
  ]
} as const;

export const WICK_PROGRAM_ID = WICK_IDL.address;
