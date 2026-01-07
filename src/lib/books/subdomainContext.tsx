"use client";

import { createContext, useContext, useEffect, useState } from "react";

type SubdomainContextType = {
  isSubdomain: boolean;
};

const SubdomainContext = createContext<SubdomainContextType>({
  isSubdomain: false,
});

export function SubdomainProvider({ children }: { children: React.ReactNode }) {
  const [isSubdomain, setIsSubdomain] = useState(false);

  useEffect(() => {
    // Check if we're on the books subdomain by examining the hostname
    const hostname = window.location.hostname;
    // Check for both localhost and production subdomain
    const isBooksSubdomain =
      hostname.startsWith("books.localhost") ||
      hostname.startsWith("books.chappyasel.com");
    setIsSubdomain(isBooksSubdomain);
  }, []);

  return (
    <SubdomainContext.Provider value={{ isSubdomain }}>
      {children}
    </SubdomainContext.Provider>
  );
}

export function useSubdomain() {
  const context = useContext(SubdomainContext);
  if (context === undefined) {
    throw new Error("useSubdomain must be used within SubdomainProvider");
  }
  return context;
}
