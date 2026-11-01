import {
  createSendFlow,
  type SendFlowController,
  type SendFlowOptions,
  type SendFlowState,
  type SendFlowWallet,
} from "@gnee/api-client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * React binding for @gnee/api-client's headless createSendFlow controller
 * (mirrored in packages/mobile-ui/src/hooks/useSendFlow.ts). The controller lives for the component's
 * lifetime, so its idempotency key survives re-renders and retries.
 */
export function useSendFlow(
  options: Omit<SendFlowOptions, "wallet"> & { wallet: SendFlowWallet | null }
): [SendFlowState, SendFlowController] {
  const onSuccessRef = useRef(options.onSuccess);
  useEffect(() => {
    onSuccessRef.current = options.onSuccess;
  });

  const [flow] = useState(() =>
    createSendFlow({ ...options, onSuccess: (tx) => onSuccessRef.current?.(tx) })
  );

  const { wallet } = options;
  useEffect(() => {
    flow.setWallet(wallet);
  }, [flow, wallet]);

  const state = useSyncExternalStore(flow.subscribe, flow.getState, flow.getState);
  return [state, flow];
}
