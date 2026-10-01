export type Reservepay = {
  address: "ERFq8y9tC4bjMk4AbLoM7zZXtvRcxsHdCMa9GpSnwxsU";
  metadata: {
    name: "reservepay";
    version: "0.1.0";
    spec: "0.1.0";
    description: "Protected stablecoin payments on Solana";
  };
  instructions: [
    {
      name: "completeOrder";
      discriminator: [73, 78, 89, 7, 140, 132, 17, 97];
      accounts: [
        {
          name: "protocol";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 114, 111, 116, 111, 99, 111, 108];
              },
            ];
          };
        },
        {
          name: "merchant";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [109, 101, 114, 99, 104, 97, 110, 116];
              },
              {
                kind: "account";
                path: "merchant.authority";
                account: "merchant";
              },
              {
                kind: "account";
                path: "merchant.mint";
                account: "merchant";
              },
            ];
          };
          relations: ["order"];
        },
        {
          name: "order";
          writable: true;
        },
        {
          name: "reserveVault";
          writable: true;
          relations: ["merchant"];
        },
        {
          name: "merchantTokenAccount";
          writable: true;
        },
        {
          name: "caller";
          signer: true;
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
      ];
      args: [];
    },
    {
      name: "createOrder";
      discriminator: [141, 54, 37, 207, 237, 210, 250, 215];
      accounts: [
        {
          name: "protocol";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 114, 111, 116, 111, 99, 111, 108];
              },
            ];
          };
        },
        {
          name: "merchant";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [109, 101, 114, 99, 104, 97, 110, 116];
              },
              {
                kind: "account";
                path: "merchant.authority";
                account: "merchant";
              },
              {
                kind: "account";
                path: "mint";
              },
            ];
          };
        },
        {
          name: "order";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [111, 114, 100, 101, 114];
              },
              {
                kind: "account";
                path: "merchant";
              },
              {
                kind: "arg";
                path: "reference";
              },
            ];
          };
        },
        {
          name: "buyerTokenAccount";
          writable: true;
        },
        {
          name: "merchantTokenAccount";
          writable: true;
        },
        {
          name: "reserveVault";
          writable: true;
          relations: ["merchant"];
        },
        {
          name: "mint";
          relations: ["merchant"];
        },
        {
          name: "buyer";
          writable: true;
          signer: true;
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "reference";
          type: {
            array: ["u8", 16];
          };
        },
        {
          name: "amount";
          type: "u64";
        },
        {
          name: "protectionWindow";
          type: "i64";
        },
      ];
    },
    {
      name: "fundReserve";
      discriminator: [17, 82, 71, 222, 117, 210, 58, 12];
      accounts: [
        {
          name: "merchant";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [109, 101, 114, 99, 104, 97, 110, 116];
              },
              {
                kind: "account";
                path: "authority";
              },
              {
                kind: "account";
                path: "merchant.mint";
                account: "merchant";
              },
            ];
          };
        },
        {
          name: "source";
          writable: true;
        },
        {
          name: "reserveVault";
          writable: true;
          relations: ["merchant"];
        },
        {
          name: "authority";
          signer: true;
          relations: ["merchant"];
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        },
      ];
    },
    {
      name: "initializeProtocol";
      discriminator: [188, 233, 252, 106, 134, 146, 202, 91];
      accounts: [
        {
          name: "protocol";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 114, 111, 116, 111, 99, 111, 108];
              },
            ];
          };
        },
        {
          name: "authority";
          writable: true;
          signer: true;
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "resolver";
          type: "pubkey";
        },
        {
          name: "defaultReserveBps";
          type: "u16";
        },
      ];
    },
    {
      name: "refundOrder";
      discriminator: [164, 168, 47, 144, 154, 1, 241, 255];
      accounts: [
        {
          name: "protocol";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 114, 111, 116, 111, 99, 111, 108];
              },
            ];
          };
        },
        {
          name: "merchant";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [109, 101, 114, 99, 104, 97, 110, 116];
              },
              {
                kind: "account";
                path: "merchant.authority";
                account: "merchant";
              },
              {
                kind: "account";
                path: "merchant.mint";
                account: "merchant";
              },
            ];
          };
          relations: ["order"];
        },
        {
          name: "order";
          writable: true;
        },
        {
          name: "reserveVault";
          writable: true;
          relations: ["merchant"];
        },
        {
          name: "buyerTokenAccount";
          writable: true;
          relations: ["order"];
        },
        {
          name: "resolver";
          signer: true;
          relations: ["protocol"];
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
      ];
      args: [];
    },
    {
      name: "registerMerchant";
      discriminator: [238, 245, 77, 132, 161, 88, 216, 248];
      accounts: [
        {
          name: "protocol";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 114, 111, 116, 111, 99, 111, 108];
              },
            ];
          };
        },
        {
          name: "merchant";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [109, 101, 114, 99, 104, 97, 110, 116];
              },
              {
                kind: "account";
                path: "authority";
              },
              {
                kind: "account";
                path: "mint";
              },
            ];
          };
        },
        {
          name: "reserveVault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "merchant";
              },
              {
                kind: "const";
                value: [
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
                  169,
                ];
              },
              {
                kind: "account";
                path: "mint";
              },
            ];
            program: {
              kind: "const";
              value: [
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
                89,
              ];
            };
          };
        },
        {
          name: "mint";
        },
        {
          name: "authority";
          writable: true;
          signer: true;
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
        {
          name: "associatedTokenProgram";
          address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [];
    },
    {
      name: "setMerchantReserveRate";
      discriminator: [229, 162, 56, 45, 100, 227, 105, 30];
      accounts: [
        {
          name: "protocol";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 114, 111, 116, 111, 99, 111, 108];
              },
            ];
          };
        },
        {
          name: "merchant";
          writable: true;
        },
        {
          name: "authority";
          signer: true;
          relations: ["protocol"];
        },
      ];
      args: [
        {
          name: "reserveBps";
          type: "u16";
        },
      ];
    },
    {
      name: "setResolver";
      discriminator: [137, 108, 27, 51, 202, 16, 33, 119];
      accounts: [
        {
          name: "protocol";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 114, 111, 116, 111, 99, 111, 108];
              },
            ];
          };
        },
        {
          name: "authority";
          signer: true;
          relations: ["protocol"];
        },
      ];
      args: [
        {
          name: "resolver";
          type: "pubkey";
        },
      ];
    },
    {
      name: "withdrawReserve";
      discriminator: [165, 158, 228, 5, 114, 119, 194, 14];
      accounts: [
        {
          name: "merchant";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [109, 101, 114, 99, 104, 97, 110, 116];
              },
              {
                kind: "account";
                path: "authority";
              },
              {
                kind: "account";
                path: "merchant.mint";
                account: "merchant";
              },
            ];
          };
        },
        {
          name: "reserveVault";
          writable: true;
          relations: ["merchant"];
        },
        {
          name: "destination";
          writable: true;
        },
        {
          name: "authority";
          signer: true;
          relations: ["merchant"];
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        },
      ];
    },
  ];
  accounts: [
    {
      name: "merchant";
      discriminator: [71, 235, 30, 40, 231, 21, 32, 64];
    },
    {
      name: "order";
      discriminator: [134, 173, 223, 185, 77, 86, 28, 51];
    },
    {
      name: "protocol";
      discriminator: [45, 39, 101, 43, 115, 72, 131, 40];
    },
  ];
  events: [
    {
      name: "merchantRegistered";
      discriminator: [202, 61, 140, 95, 139, 239, 17, 83];
    },
    {
      name: "merchantReserveRateChanged";
      discriminator: [215, 40, 64, 35, 53, 4, 60, 100];
    },
    {
      name: "orderCompleted";
      discriminator: [90, 77, 52, 248, 56, 233, 110, 197];
    },
    {
      name: "orderCreated";
      discriminator: [224, 1, 229, 63, 254, 60, 190, 159];
    },
    {
      name: "orderRefunded";
      discriminator: [120, 155, 10, 169, 7, 98, 202, 187];
    },
    {
      name: "protocolInitialized";
      discriminator: [173, 122, 168, 254, 9, 118, 76, 132];
    },
    {
      name: "reserveFunded";
      discriminator: [15, 45, 175, 239, 65, 137, 203, 230];
    },
    {
      name: "reserveWithdrawn";
      discriminator: [186, 11, 109, 7, 117, 246, 188, 249];
    },
    {
      name: "resolverChanged";
      discriminator: [6, 235, 225, 252, 79, 239, 195, 145];
    },
  ];
  errors: [
    {
      code: 6000;
      name: "invalidAmount";
      msg: "The amount must be greater than zero";
    },
    {
      code: 6001;
      name: "invalidReserveRate";
      msg: "The reserve rate must be between zero and 10,000 basis points";
    },
    {
      code: 6002;
      name: "invalidProtectionWindow";
      msg: "The protection window is outside the supported range";
    },
    {
      code: 6003;
      name: "insufficientCoverage";
      msg: "The merchant reserve cannot cover all open orders";
    },
    {
      code: 6004;
      name: "orderStillProtected";
      msg: "The protection window is still open";
    },
    {
      code: 6005;
      name: "orderClosed";
      msg: "The order has already been resolved";
    },
    {
      code: 6006;
      name: "mathOverflow";
      msg: "A numeric operation overflowed";
    },
  ];
  types: [
    {
      name: "merchant";
      type: {
        kind: "struct";
        fields: [
          {
            name: "authority";
            type: "pubkey";
          },
          {
            name: "mint";
            type: "pubkey";
          },
          {
            name: "reserveVault";
            type: "pubkey";
          },
          {
            name: "reserveBps";
            type: "u16";
          },
          {
            name: "lockedLiability";
            type: "u64";
          },
          {
            name: "totalVolume";
            type: "u64";
          },
          {
            name: "completedOrders";
            type: "u64";
          },
          {
            name: "refundedOrders";
            type: "u64";
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "merchantRegistered";
      type: {
        kind: "struct";
        fields: [
          {
            name: "merchant";
            type: "pubkey";
          },
          {
            name: "authority";
            type: "pubkey";
          },
          {
            name: "mint";
            type: "pubkey";
          },
          {
            name: "reserveBps";
            type: "u16";
          },
        ];
      };
    },
    {
      name: "merchantReserveRateChanged";
      type: {
        kind: "struct";
        fields: [
          {
            name: "merchant";
            type: "pubkey";
          },
          {
            name: "reserveBps";
            type: "u16";
          },
        ];
      };
    },
    {
      name: "order";
      type: {
        kind: "struct";
        fields: [
          {
            name: "merchant";
            type: "pubkey";
          },
          {
            name: "buyer";
            type: "pubkey";
          },
          {
            name: "buyerTokenAccount";
            type: "pubkey";
          },
          {
            name: "reference";
            type: {
              array: ["u8", 16];
            };
          },
          {
            name: "amount";
            type: "u64";
          },
          {
            name: "reserveAmount";
            type: "u64";
          },
          {
            name: "createdAt";
            type: "i64";
          },
          {
            name: "expiresAt";
            type: "i64";
          },
          {
            name: "status";
            type: {
              defined: {
                name: "orderStatus";
              };
            };
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "orderCompleted";
      type: {
        kind: "struct";
        fields: [
          {
            name: "order";
            type: "pubkey";
          },
          {
            name: "merchant";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "orderCreated";
      type: {
        kind: "struct";
        fields: [
          {
            name: "order";
            type: "pubkey";
          },
          {
            name: "merchant";
            type: "pubkey";
          },
          {
            name: "buyer";
            type: "pubkey";
          },
          {
            name: "reference";
            type: {
              array: ["u8", 16];
            };
          },
          {
            name: "amount";
            type: "u64";
          },
          {
            name: "reserveAmount";
            type: "u64";
          },
          {
            name: "expiresAt";
            type: "i64";
          },
        ];
      };
    },
    {
      name: "orderRefunded";
      type: {
        kind: "struct";
        fields: [
          {
            name: "order";
            type: "pubkey";
          },
          {
            name: "merchant";
            type: "pubkey";
          },
          {
            name: "buyer";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "orderStatus";
      type: {
        kind: "enum";
        variants: [
          {
            name: "open";
          },
          {
            name: "completed";
          },
          {
            name: "refunded";
          },
        ];
      };
    },
    {
      name: "protocol";
      type: {
        kind: "struct";
        fields: [
          {
            name: "authority";
            type: "pubkey";
          },
          {
            name: "resolver";
            type: "pubkey";
          },
          {
            name: "defaultReserveBps";
            type: "u16";
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "protocolInitialized";
      type: {
        kind: "struct";
        fields: [
          {
            name: "authority";
            type: "pubkey";
          },
          {
            name: "resolver";
            type: "pubkey";
          },
          {
            name: "defaultReserveBps";
            type: "u16";
          },
        ];
      };
    },
    {
      name: "reserveFunded";
      type: {
        kind: "struct";
        fields: [
          {
            name: "merchant";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "reserveWithdrawn";
      type: {
        kind: "struct";
        fields: [
          {
            name: "merchant";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "resolverChanged";
      type: {
        kind: "struct";
        fields: [
          {
            name: "resolver";
            type: "pubkey";
          },
        ];
      };
    },
  ];
};
