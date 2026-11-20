"use client";

import { useEffect, useState } from "react";
import { inClientScope, type ClientScope } from "@/lib/client-scope";

// Clientes que puede ver quien está conectado (null = todos). `loaded` es falso hasta que responde el
// servidor: las pantallas esperan para no pedir datos de un cliente que no le corresponde.
export function useClientScope(): { loaded: boolean; scope: ClientScope } {
  const [state, setState] = useState<{ loaded: boolean; scope: ClientScope }>({ loaded: false, scope: null });
  useEffect(() => {
    let active = true;
    fetch("/api/me/client-scope")
      .then((response) => (response.ok ? (response.json() as Promise<{ restricted: boolean; clients: string[] }>) : Promise.reject(new Error("scope"))))
      .then((data) => active && setState({ loaded: true, scope: data.restricted ? data.clients : null }))
      // Si no se puede leer, no se muestra ningún cliente: el servidor igual no devuelve datos ajenos.
      .catch(() => active && setState({ loaded: true, scope: [] }));
    return () => {
      active = false;
    };
  }, []);
  return state;
}

export { inClientScope };
