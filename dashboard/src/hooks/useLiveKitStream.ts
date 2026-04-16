"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteVideoTrack,
} from "livekit-client";

import {
  LIVEKIT_ROOM,
  LIVEKIT_TOKEN_ENDPOINT,
} from "@/lib/constants";
import type {
  CameraId,
  WebRTCStreamState,
  WebRTCStreamStats,
} from "@/types/webrtc";
import { EMPTY_STREAM_STATS } from "@/types/webrtc";

export interface UseLiveKitStreamReturn {
  state: WebRTCStreamState;
  track: RemoteVideoTrack | null;
  stats: WebRTCStreamStats;
  start: (camera: CameraId) => void;
  stop: () => void;
}

interface LiveKitViewerCredentials {
  token: string;
  url: string;
  room: string;
  identity: string;
  name: string;
}

type PublicationLike = RemoteTrackPublication & {
  trackName?: string;
  name?: string;
  mimeType?: string;
  dimensions?: { width: number; height: number };
  videoTrack?: RemoteVideoTrack;
};

function mapConnectionState(
  state: ConnectionState,
): WebRTCStreamState {
  switch (state) {
    case ConnectionState.Connected:
      return "connected";
    case ConnectionState.Connecting:
      return "connecting";
    case ConnectionState.Reconnecting:
      return "connecting";
    case ConnectionState.Disconnected:
    default:
      return "closed";
  }
}

export function useLiveKitStream(): UseLiveKitStreamReturn {
  const [state, setState] = useState<WebRTCStreamState>("idle");
  const [track, setTrack] = useState<RemoteVideoTrack | null>(null);
  const [stats, setStats] = useState<WebRTCStreamStats>(EMPTY_STREAM_STATS);

  const roomRef = useRef<Room | null>(null);
  const cameraRef = useRef<CameraId | null>(null);

  const getPublicationName = useCallback((publication: PublicationLike) => {
    return publication.trackName ?? publication.name ?? "";
  }, []);

  const resetState = useCallback(() => {
    setTrack(null);
    setStats(EMPTY_STREAM_STATS);
    setState("idle");
    cameraRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const currentRoom = roomRef.current;
    roomRef.current = null;

    if (currentRoom) {
      void currentRoom.disconnect();
    }

    resetState();
  }, [resetState]);

  const bindPublication = useCallback(
    (
      publication: RemoteTrackPublication,
      maybeTrack?: RemoteTrack,
    ) => {
      const candidate = publication as PublicationLike;
      if (candidate.kind !== Track.Kind.Video) return;
      if (getPublicationName(candidate) !== cameraRef.current) return;

      if (typeof candidate.setSubscribed === "function") {
        candidate.setSubscribed(true);
      }

      const remoteVideoTrack =
        (maybeTrack as RemoteVideoTrack | undefined) ??
        candidate.videoTrack;

      if (!remoteVideoTrack) return;

      setTrack(remoteVideoTrack);
      setState("connected");
      setStats({
        frameWidth: candidate.dimensions?.width ?? 0,
        frameHeight: candidate.dimensions?.height ?? 0,
        fps: 0,
        currentRttSec: 0,
        jitterSec: 0,
        packetsLost: 0,
        packetsReceived: 0,
        codec:
          candidate.mimeType?.split("/")?.[1]?.toUpperCase() ??
          "H264",
        sampledAt: Date.now(),
      });
    },
    [getPublicationName],
  );

  const fetchViewerCredentials = useCallback(
    async (camera: CameraId): Promise<LiveKitViewerCredentials> => {
      const identity = `dashboard-${camera}-${Date.now()}`;
      const params = new URLSearchParams({
        room: LIVEKIT_ROOM,
        identity,
        name: "Dashboard Operator",
        publish: "0",
        subscribe: "1",
      });

      const response = await fetch(
        `${LIVEKIT_TOKEN_ENDPOINT}?${params.toString()}`,
      );
      if (!response.ok) {
        throw new Error(
          `Failed to fetch LiveKit token (${response.status})`,
        );
      }

      return (await response.json()) as LiveKitViewerCredentials;
    },
    [],
  );

  const start = useCallback(
    (camera: CameraId) => {
      void (async () => {
        stop();
        cameraRef.current = camera;
        setState("signaling");

        try {
          const credentials =
            await fetchViewerCredentials(camera);
          const room = new Room({
            adaptiveStream: true,
            dynacast: true,
          });
          roomRef.current = room;

          room.on(RoomEvent.ConnectionStateChanged, (next) => {
            const mapped = mapConnectionState(next);
            setState((current) =>
              current === "connected" && mapped === "closed"
                ? "closed"
                : mapped,
            );
          });

          room.on(
            RoomEvent.TrackSubscribed,
            (subscribedTrack, publication) => {
              bindPublication(
                publication as RemoteTrackPublication,
                subscribedTrack as RemoteTrack,
              );
            },
          );

          room.on(RoomEvent.TrackPublished, (publication) => {
            bindPublication(
              publication as RemoteTrackPublication,
            );
          });

          room.on(
            RoomEvent.TrackUnsubscribed,
            (_unsubscribedTrack, publication) => {
              if (
                getPublicationName(publication as PublicationLike) ===
                cameraRef.current
              ) {
                setTrack(null);
                setState("closed");
              }
            },
          );

          await room.connect(credentials.url, credentials.token);
          setState("connecting");

          room.remoteParticipants.forEach((participant) => {
            participant.trackPublications.forEach((publication) => {
              bindPublication(
                publication as RemoteTrackPublication,
              );
            });
          });
        } catch (error) {
          console.error("LiveKit stream startup failed", error);
          setState("failed");
          setTrack(null);
          setStats(EMPTY_STREAM_STATS);
        }
      })();
    },
    [bindPublication, fetchViewerCredentials, getPublicationName, stop],
  );

  useEffect(() => stop, [stop]);

  return { state, track, stats, start, stop };
}
