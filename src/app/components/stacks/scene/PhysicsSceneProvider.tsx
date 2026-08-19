"use client";

import { useFrame } from "@react-three/fiber";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useRef,
} from "react";
import type * as THREE from "three";

export type PhysicsStaticRoot = {
  id: string;
  kind: "unit" | "shared";
  root: THREE.Object3D;
  unitIndex?: number;
};

/**
 * Cannon-independent ownership for one mounted scene. The solver is still
 * lazy-loaded by Grabbable; this scope only gives that eventual solver a
 * lifecycle-safe registry instead of relying on module globals.
 */
export class PhysicsSceneScope {
  private readonly registeredHandles = new Set<object>();
  private readonly registeredRoots = new Map<string, PhysicsStaticRoot>();
  private readonly cleanup = new Set<() => void>();
  private frameDriver:
    | ((delta: number, stamp: number, camera: THREE.Camera) => void)
    | null = null;

  registerHandle<T extends object>(handle: T) {
    this.registeredHandles.add(handle);
    return () => this.registeredHandles.delete(handle);
  }

  handles<T extends object>() {
    return this.registeredHandles as unknown as ReadonlySet<T>;
  }

  registerRoot(root: PhysicsStaticRoot) {
    this.registeredRoots.set(root.id, root);
    return () => {
      if (this.registeredRoots.get(root.id) === root)
        this.registeredRoots.delete(root.id);
    };
  }

  roots() {
    return [...this.registeredRoots.values()];
  }

  onDispose(cleanup: () => void) {
    this.cleanup.add(cleanup);
    return () => this.cleanup.delete(cleanup);
  }

  installFrameDriver(
    driver: (delta: number, stamp: number, camera: THREE.Camera) => void,
  ) {
    this.frameDriver = driver;
    return () => {
      if (this.frameDriver === driver) this.frameDriver = null;
    };
  }

  tick(delta: number, stamp: number, camera: THREE.Camera) {
    this.frameDriver?.(delta, stamp, camera);
  }

  dispose() {
    for (const cleanup of this.cleanup) cleanup();
    this.cleanup.clear();
    this.registeredHandles.clear();
    this.registeredRoots.clear();
  }
}

const PhysicsSceneContext = createContext<PhysicsSceneScope | null>(null);

export function PhysicsSceneProvider({ children }: { children: ReactNode }) {
  const scope = useRef<PhysicsSceneScope>(null);
  scope.current ??= new PhysicsSceneScope();
  useEffect(() => {
    const mounted = scope.current!;
    return () => mounted.dispose();
  }, []);
  return (
    <PhysicsSceneContext.Provider value={scope.current}>
      {children}
    </PhysicsSceneContext.Provider>
  );
}

export function usePhysicsScene() {
  const scope = useContext(PhysicsSceneContext);
  if (!scope)
    throw new Error("Grabbable physics requires PhysicsSceneProvider");
  return scope;
}

/** Mounted after scene content so carried poses are committed before Cannon
 * advances. One callback owns stepping and visibility resets for every unit. */
export function PhysicsSceneFrameDriver() {
  const scope = usePhysicsScene();
  useFrame((state, rawDelta) => {
    scope.tick(
      Math.min(rawDelta, 1 / 30),
      state.clock.elapsedTime,
      state.camera,
    );
  });
  return null;
}
