import { Adb, AdbDaemonTransport, ADB_DEFAULT_AUTHENTICATORS } from "@yume-chan/adb";
import type { AdbCredentialStore, AdbPrivateKey } from "@yume-chan/adb";
import { AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";

const STORAGE_KEY = "weblogcat:adb-keys";

class LocalStorageCredentialStore implements AdbCredentialStore {
    private load(): { buffer: number[]; name?: string }[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? (JSON.parse(raw) as { buffer: number[]; name?: string }[]) : [];
        } catch {
            return [];
        }
    }

    async generateKey(): Promise<AdbPrivateKey> {
        const kp = await crypto.subtle.generateKey(
            {
                name: "RSASSA-PKCS1-v1_5",
                modulusLength: 2048,
                publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
                hash: "SHA-256",
            },
            true,
            ["sign", "verify"],
        );
        const pkcs8 = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
        const key: AdbPrivateKey = { buffer: new Uint8Array(pkcs8), name: "weblogcat" };
        const stored = this.load();
        stored.push({ buffer: Array.from(key.buffer), name: key.name });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        return key;
    }

    iterateKeys(): Iterable<AdbPrivateKey> {
        return this.load().map(({ buffer, name }) => ({
            buffer: new Uint8Array(buffer),
            name,
        }));
    }
}

export async function connectDevice(): Promise<Adb> {
    const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
    if (!manager) {
        throw new Error("WebUSB is not supported in this browser. Use Chrome or Edge.");
    }

    const device = await manager.requestDevice();
    if (!device) {
        throw new Error("No device selected.");
    }

    const connection = await device.connect();
    const transport = await AdbDaemonTransport.authenticate({
        serial: device.serial,
        connection,
        credentialStore: new LocalStorageCredentialStore(),
        authenticators: ADB_DEFAULT_AUTHENTICATORS,
    });

    return new Adb(transport);
}

export async function disconnectDevice(adb: Adb): Promise<void> {
    await adb.close();
}
