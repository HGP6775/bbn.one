import { assert } from "std/testing/asserts.ts";
import { Drop, DropType, File, Meta, OAuthApp, Payout, PowerState, PteroServer, Server, ServerCreate, Wallet } from "../../spec/music.ts";
import { ProfileData } from "../manager/helper.ts";

export const Permissions = [
    "/hmsys",
    "/hmsys/user",
    "/hmsys/user/manage",

    "/bbn",
    "/bbn/beta-hosting",
    "/bbn/manage",
    "/bbn/manage/drops",
    "/bbn/manage/drops/review",
    "/bbn/manage/payouts",
] as const;

export type Permission = typeof Permissions[ number ];
export type External<T> = PromiseSettledResult<T> | "loading";

async function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
    try {
        return {
            status: "fulfilled",
            value: await promise
        };
    } catch (e) {
        return {
            status: "rejected",
            reason: e
        };
    }
}

function json<T>() {
    return async (rsp: Response) => {
        if (!rsp.ok)
            return await settle(Promise.reject(await rsp.text()));
        return await settle(rsp.json() as Promise<T>);
    };
}

function none() {
    return async (rsp: Response) => {
        if (!rsp.ok)
            return await settle(Promise.reject(await rsp.text()));
        return await settle(Promise.resolve(true));
    };
}

function blob() {
    return async (rsp: Response) => {
        if (!rsp.ok)
            return await settle(Promise.reject(await rsp.text()));
        return await settle(rsp.blob());
    };
}

export function stupidErrorAlert<T>(data: PromiseSettledResult<T>): T {
    if (data.status === "fulfilled")
        return data.value;
    alert(JSON.stringify(data.reason));
    throw data.reason;
}


function reject(rsp: unknown) {
    return settle(Promise.reject(rsp));
}

export const defaultError = "Something happend unexpectedly. Please try again later.";

// This is very limited make error handling more useful.
export function displayError(data: unknown) {
    console.error("displayError", data);
    if (data instanceof Error) {
        if (data.message === "Failed to fetch")
            return "Error: Can't load. Please try again later.";

        return `Error: ${data.message || defaultError}`;
    }
    if (typeof data === "string") {
        try {
            const jdata = JSON.parse(data) as unknown;
            // display assert errors that have a message
            if (jdata && typeof jdata === "object" && 'type' in jdata && 'message' in jdata && jdata.type === "assert") {
                return `Error: ${jdata.message || defaultError}`;
            }
        } catch (_e) {
            return "Error: " + defaultError;
        }
    }
    return "Error: " + defaultError;
}

export const API = {
    getToken: () => localStorage[ "access-token" ],
    BASE_URL: <string>localStorage.OVERRIDE_BASE_URL || (location.hostname == "bbn.one" ? "https://bbn.one/api/@bbn/" : "http://localhost:8443/api/@bbn/"),
    WS_URL: <string>localStorage.OVERRIDE_BASE_URL || (location.hostname == "bbn.one" ? "wss://bbn.one/ws" : "ws://localhost:8443/ws"),
    permission: Permissions,
    _legacyPermissionFromGroups: (group: string) => {
        const admin = "6293b146d55350d24e6da542";
        const reviewer = "6293bb4fd55350d24e6da550";
        if (group === reviewer)
            return [
                "/bbn/payouts"
            ];

        if (group === admin)
            // Always highest permissions
            return [
                "/bbn",
                "/hmsys"
            ];
        return [];
    },
    isPermited: (requiredPermissions: Permission[], userPermission: Permission[]) => {
        return requiredPermissions.every(required => userPermission.find(user => required.startsWith(user)));
    },
    user: (token: string) => ({
        mail: {
            validate: {
                post: (emailToken: string) => fetch(`${API.BASE_URL}user/mail/validate/` + emailToken, {
                    method: "POST",
                    headers: headers(token),
                }).then(none())

            },
            resendVerifyEmail: {
                post: () => {
                    return fetch(`${API.BASE_URL}user/mail/resend-verify-email`, {
                        method: "POST",
                        headers: headers(token),
                    }).then(none());
                }
            }
        },
        setMe: {
            post: (para: Partial<{ name: string, password: string; }>) => {
                return fetch(`${API.BASE_URL}user/set-me`, {
                    method: "POST",
                    headers: headers(token),
                    body: JSON.stringify(para)
                })
                    .then(none());

            }
        },
        list: {
            get: async () => {
                const data = await fetch(`${API.BASE_URL}user/users`, {
                    headers: headers(token)
                })
                    .then(x => x.json());
                return data.users as ProfileData[];
            }
        },
        zendesk: {
            post: async () => {
                return await fetch(`${API.BASE_URL}user/zendesk`, {
                    method: "POST",
                    headers: headers(token)
                }).then(x => x.json()) as { jwt: string; };
            }
        },
    }),
    auth: {
        fromUserInteractionLinkGoogle: () => `${API.BASE_URL}auth/google-redirect?redirect=${localStorage.getItem('goal') ?? '/music'}&type=google-auth`,
        fromUserInteractionLinkDiscord: () => `${API.BASE_URL}auth/discord-redirect?redirect=${localStorage.getItem('goal') ?? '/music'}&type=discord-auth`,
        refreshAccessToken: {
            post: async ({ refreshToken }: { refreshToken: string; }) => {
                return await fetch(`${API.BASE_URL}auth/refresh-access-token`, {
                    method: "POST",
                    headers: {
                        "Authorization": "JWT " + refreshToken
                    }
                })
                    .then(x => x.json()) as { token: string; };
            }
        },
        google: {
            post: ({ code, state }: { code: string, state: string; }) => {
                const param = new URLSearchParams({ code, state });
                return fetch(`${API.BASE_URL}auth/google?${param.toString()}`, {
                    method: "POST"
                })
                    .then(json<{ token: string; }>())
                    .catch(reject);
            }
        },
        discord: {
            post: async ({ code, state }: { code: string, state: string; }) => {
                const param = new URLSearchParams({ code, state });
                return await fetch(`${API.BASE_URL}auth/discord?${param.toString()}`, {
                    method: "POST"
                })
                    .then(json<{ token: string; }>())
                    .catch(reject);
            }
        },
        fromUserInteraction: {
            get: (id: string) => {
                return fetch(`${API.BASE_URL}auth/from-user-interaction/${id}`, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json"
                    }
                })
                    .then(json<{ token: string; }>())
                    .catch(reject);
            }
        },
        forgotPassword: {
            post: ({ email }: { email: string; }) => fetch(`${API.BASE_URL}auth/forgot-password`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email
                })
            })
                .then(none())
        },
        register: {
            post: async ({ email, password, name }: { email: string, password: string, name: string; }) => {
                return await fetch(`${API.BASE_URL}auth/register`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        email,
                        password,
                        name
                    })
                })
                    .then(json<{ token: string; }>())
                    .catch(reject);
            }
        },
        email: {
            post: ({ email, password }: { email: string, password: string; }) => {
                return fetch(`${API.BASE_URL}auth/email`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        email,
                        password
                    })
                })
                    .then(json<{ token: string; }>())
                    .catch(reject);
            }
        }
    },
    wallet: (token: string) => ({
        get: async (): Promise<Wallet> => {
            const data = await fetch(`${API.BASE_URL}wallet/get`, {
                headers: headers(token)
            }).then(x => x.json());
            return data;
        },
        requestPayout: async (): Promise<{ success: boolean; }> => {
            const data = await fetch(`${API.BASE_URL}wallet/request-payment`, {
                method: "POST",
                headers: headers(token),
            }).then(x => x.json());
            return data;
        }
    }),
    oauth: (token: string) => ({
        get: (clientid: string) => {
            return fetch(`${API.BASE_URL}oauth/applications/${clientid}`, {
                headers: headers(token)
            })
                .then(json<OAuthApp>())
                .catch(reject);
        },
        list: () => {
            return fetch(`${API.BASE_URL}oauth/applications`, {
                headers: headers(token)
            })
                .then(json<OAuthApp[]>())
                .catch(reject);
        },
        post: (name: string, redirect: string, icon: string) => {
            return fetch(`${API.BASE_URL}oauth/applications`, {
                method: "POST",
                headers: headers(token),
                body: JSON.stringify({ name, redirect, icon })
            })
                .then(json<{ id: string, secret: string; }>())
                .catch(reject);
        },
        icon: (clientid: string) => {
            return fetch(`${API.BASE_URL}oauth/applications/${clientid}/download`, {
                headers: headers(token)
            })
                .then(blob());
        },
        delete: (clientid: string) => {
            return fetch(`${API.BASE_URL}oauth/applications/${clientid}`, {
                method: "DELETE",
                headers: headers(token)
            })
                .then(none());
        }
    }),
    admin: (token: string) => ({
        files: {
            list: async (): Promise<File[]> => {
                const data = await fetch(`${API.BASE_URL}admin/files`, {
                    headers: headers(token)
                }).then(x => x.json());
                return data;
            },
            download: async (id: string) => {
                const data = await fetch(`${API.BASE_URL}admin/files/${id}/download`, {
                    headers: headers(token)
                }).then(x => x.blob());
                return data;
            },
            delete: async (id: string) => {
                const data = await fetch(`${API.BASE_URL}admin/files/${id}`, {
                    method: "DELETE",
                    headers: headers(token)
                }).then(x => x.json());
                return data;
            }
        },
        reviews: {
            get: async () => {
                const data = await fetch(`${API.BASE_URL}admin/reviews`, {
                    headers: headers(token)
                }).then(x => x.json());
                return data as Drop[];
            },
        },
        payouts: {
            get: async () => {
                const data = await fetch(`${API.BASE_URL}admin/payouts`, {
                    headers: headers(token)
                }).then(x => x.json());
                return data as Payout[];
            },
            id: (id: string) => ({
                get: async () => {
                    const data = await fetch(`${API.BASE_URL}admin/payouts/${id}`, {
                        headers: headers(token)
                    }).then(x => x.json());
                    return data as Payout;
                }
            })
        },
        servers: {
            get: async () => {
                const data = await fetch(`${API.BASE_URL}admin/servers`, {
                    headers: headers(token)
                }).then(x => x.json());
                return data as Server[];
            }
        },
        wallets: {
            list: async () => {
                const data = await fetch(`${API.BASE_URL}admin/wallets`, {
                    headers: headers(token)
                }).then(x => x.json());
                return data as Wallet[];
            },
            get: async (id: string) => {
                const data = await fetch(`${API.BASE_URL}admin/wallets/${id}`, {
                    headers: headers(token)
                }).then(x => x.json());
                return data as Wallet;
            },
            update: async (id: string, data: Wallet) => {
                const res = await fetch(`${API.BASE_URL}admin/wallets/${id}`, {
                    method: "PATCH",
                    headers: headers(token),
                    body: JSON.stringify(data)
                });
                return res;
            }
        }
    }),
    payment: (token: string) => ({
        payouts: {
            get: async () => {
                const data = await fetch(`${API.BASE_URL}payment/payouts`, {
                    headers: headers(token)
                }).then(x => x.json());
                return data as Payout[];
            },
            id: (id: string) => ({
                get: async () => {
                    const data = await fetch(`${API.BASE_URL}payment/payouts/${id}`, {
                        headers: headers(token)
                    }).then(x => x.json());
                    return data as Payout;
                }
            })
        },
    }),
    hosting: (token: string) => ({
        servers: (): Promise<Server[]> => {
            return fetch(`${API.BASE_URL}hosting/servers`, {
                headers: headers(token)
            }).then(x => x.json());
        },
        create: (data: ServerCreate) => {
            return fetch(`${API.BASE_URL}hosting/servers`, {
                method: 'POST',
                body: JSON.stringify(data),
                headers: headers(token)
            }).then(x => x.json());
        },
        meta: (): Promise<Meta> => {
            return fetch(`${API.BASE_URL}hosting/meta`, {
                headers: headers(token)
            }).then(x => x.json());
        },
        serverId: (id: string) => ({
            get: (): Promise<PteroServer> => {
                return fetch(`${API.BASE_URL}hosting/servers/${id}`, {
                    headers: headers(token)
                }).then(x => x.json());
            },
            power: (data: PowerState) => {
                return fetch(`${API.BASE_URL}hosting/${id}/power`, {
                    method: 'POST',
                    body: JSON.stringify({
                        signal: data
                    }),
                    headers: headers(token)
                }).then(x => x.json());
            },
            delete: () => {
                return fetch(`${API.BASE_URL}hosting/servers/${id}`, {
                    method: 'DELETE',
                    headers: headers(token)
                }).then(x => x.text());
            }
        }),
    }),
    music: (token: string) => ({
        list: {
            get: async () => {
                const data = await fetch(`${API.BASE_URL}music/list`, {
                    headers: headers(token)
                }).then(x => x.json());
                return data.drops as Drop[];
            }
        },
        post: async () => {
            const data = await fetch(`${API.BASE_URL}music/`, {
                method: "POST",
                headers: headers(token)
            }).then(x => x.json());
            assert(typeof data.id == "string");
            return data.id as string;
        },
        id: (id: string) => ({
            review: {
                post: (data: { title: string, reason: string[], body: string; denyEdits?: boolean; }) => {
                    return fetch(`${API.BASE_URL}music/${id}/review`, {
                        method: "POST",
                        headers: headers(token),
                        body: data ? JSON.stringify(data) : null
                    }).then(x => x.text());
                },
            },
            type: {
                post: (type: DropType, data?: { title: string, reason: string[], body: string; }) => {
                    return fetch(`${API.BASE_URL}music/${id}/type/${type}`, {
                        method: "POST",
                        headers: headers(token),
                        body: data ? JSON.stringify(data) : null
                    }).then(x => x.text());
                },
            },
            post: async (data: Drop) => {
                const fetchData = await fetch(`${API.BASE_URL}music/${id}`, {
                    method: "POST",
                    body: JSON.stringify(data),
                    headers: headers(token)
                });
                await fetchData.text();
                assert(fetchData.ok);
            },
            dropDownload: async (): Promise<{ code: string; }> => {
                return await fetch(`${API.BASE_URL}music/${id}/drop-download`, {
                    method: "POST",
                    headers: headers(token)
                }).then(x => x.json());
            },
            artwork: async () => {
                return await fetch(`${API.BASE_URL}music/${id}/artwork`, {
                    method: "GET",
                    headers: headers(token)
                }).then(x => x.blob());
            },
            artworkPreview: async () => {
                return await fetch(`${API.BASE_URL}music/${id}/artwork-preview`, {
                    method: "GET",
                    headers: headers(token)
                }).then(x => x.blob());
            },
            artworkStore3k: async () => {
                return await fetch(`${API.BASE_URL}music/${id}/artwork-store3k`, {
                    method: "GET",
                    headers: headers(token)
                }).then(x => x.blob());
            },
            get: async () => {
                return (await fetch(`${API.BASE_URL}music/${id}`, {
                    method: "GET",
                    headers: headers(token)
                }).then(x => x.json()));
            },
        })
    })
};

function headers(token: string): HeadersInit | undefined {
    return {
        "Authorization": "JWT " + token
    };
}
