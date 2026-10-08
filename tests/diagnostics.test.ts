import assert from "node:assert/strict";
import test from "node:test";
import {
  formatBitrate,
  formatBytes,
  maskIpAddress,
  parseIceCandidateString,
} from "../lib/diagnostics.ts";

test("masks IP addresses to protect user privacy in UI", () => {
  assert.equal(maskIpAddress("192.168.1.50"), "[Hidden for Privacy]");
  assert.equal(maskIpAddress("10.0.4.120"), "[Hidden for Privacy]");
  assert.equal(maskIpAddress("2001:0db8:85a3:0000:0000:8a2e:0370:7334"), "[Hidden for Privacy]");
  assert.equal(maskIpAddress(""), "Unknown");
  assert.equal(maskIpAddress(undefined), "Unknown");
});

test("formats bitrates cleanly for telemetry display", () => {
  assert.equal(formatBitrate(0), "0 kbps");
  assert.equal(formatBitrate(-10), "0 kbps");
  assert.equal(formatBitrate(450), "450 kbps");
  assert.equal(formatBitrate(1250), "1.3 Mbps");
  assert.equal(formatBitrate(5000), "5.0 Mbps");
});

test("formats byte counts into human readable sizes", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
});

test("parses standard SDP ice candidate lines", () => {
  const hostCandidate = "candidate:842163049 1 udp 1677729535 192.168.1.100 54321 typ host generation 0";
  const parsedHost = parseIceCandidateString(hostCandidate);
  assert.equal(parsedHost.protocol, "udp");
  assert.equal(parsedHost.address, "[Hidden for Privacy]");
  assert.equal(parsedHost.port, 54321);
  assert.equal(parsedHost.type, "host");

  const srflxCandidate = "candidate:11223344 1 udp 16777215 203.0.113.195 49152 typ srflx raddr 192.168.1.100 rport 54321";
  const parsedSrflx = parseIceCandidateString(srflxCandidate);
  assert.equal(parsedSrflx.type, "srflx");
  assert.equal(parsedSrflx.address, "[Hidden for Privacy]");
  assert.equal(parsedSrflx.port, 49152);

  const relayCandidate = "candidate:99887766 1 udp 16777000 198.51.100.2 59000 typ relay raddr 203.0.113.195 rport 49152";
  const parsedRelay = parseIceCandidateString(relayCandidate);
  assert.equal(parsedRelay.type, "relay");
  assert.equal(parsedRelay.protocol, "udp");
  assert.equal(parsedRelay.address, "[Hidden for Privacy]");
});
