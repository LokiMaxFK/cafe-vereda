import { describe, expect, it } from "vitest";
import { usernameToInternalEmail } from "./supabase";

/**
 * El login convierte el usuario visible ("gerente") en el email interno con el que se autentica
 * contra Supabase. Si esta conversión cambia, nadie puede entrar: por eso se fija aquí.
 */
const domain = import.meta.env.VITE_AUTH_EMAIL_DOMAIN ?? "pos.veredacafe.mx";
const local = (username: string) => usernameToInternalEmail(username).split("@")[0];

describe("usernameToInternalEmail", () => {
  it("usa el dominio interno configurado", () => {
    expect(usernameToInternalEmail("gerente")).toBe(`gerente@${domain}`);
  });

  it("normaliza mayúsculas y espacios alrededor", () => {
    expect(local("Gerente")).toBe("gerente");
    expect(local("  ana  ")).toBe("ana");
    expect(local("ANA")).toBe("ana");
  });

  it("conserva punto, guion bajo y guion medio", () => {
    expect(local("ana.lopez")).toBe("ana.lopez");
    expect(local("ana_lopez-1")).toBe("ana_lopez-1");
  });

  it("neutraliza un usuario que intente colar otro dominio", () => {
    // La arroba se elimina, así que el email siempre termina en el dominio interno.
    const email = usernameToInternalEmail("admin@otro-dominio.com");
    expect(email.split("@").length).toBe(2);
    expect(email.endsWith(`@${domain}`)).toBe(true);
  });

  it("descarta acentos y espacios internos al teclear el usuario", () => {
    // El alta de personal (PeoplePage) sólo permite crear usuarios con este mismo juego de
    // caracteres, así que ningún usuario guardado contiene acentos ni espacios y no hay riesgo de
    // que dos personas distintas terminen compartiendo email. Lo que esto cubre es el login: quien
    // teclee "Ana López" acaba intentando entrar como "analpez", que sencillamente no existe.
    expect(local("Ana López")).toBe("analpez");
  });

  it("es idempotente sobre un usuario ya saneado", () => {
    // Garantiza que aplicar la conversión al usuario guardado devuelve siempre el mismo email:
    // si esto se rompiera, los usuarios existentes dejarían de poder entrar.
    for (const stored of ["gerente", "ana", "ana.lopez", "ana_lopez-1", "barista2"]) {
      expect(local(stored)).toBe(stored);
    }
  });

  it("no valida usuario vacío: genera un email sin parte local", () => {
    // Comportamiento actual documentado. La validación real la hace Supabase al autenticar.
    expect(usernameToInternalEmail("   ")).toBe(`@${domain}`);
  });
});
