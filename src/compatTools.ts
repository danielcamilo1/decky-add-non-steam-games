import { findModule, findModuleExport } from "@decky/ui";

/**
 * Reads Steam's compatibility tools from its CompatManager service.
 *
 * Steam replaced `SteamClient.Settings.GetGlobalCompatTools` with this service.
 * Nothing in `@decky/ui` wraps it, so the request goes through Steam's own
 * transport and protobuf classes, found in its bundle, and only the fields used
 * here are decoded. Method name and field numbers as worked out by
 * https://github.com/FlashyReese/decky-wine-cellar (MIT).
 */

export interface CompatManagerTool {
  strToolName: string;
  strDisplayName: string;
}

interface BinaryReader {
  nextField(): boolean;
  isEndGroup(): boolean;
  getFieldNumber(): number;
  readString(): string;
  readBool(): boolean;
  readMessage<T>(value: T, read: (value: T, reader: BinaryReader) => void): void;
  skipField(): void;
}

interface BinaryWriter {
  getResultBuffer(): Uint8Array;
}

interface ParsedTool extends CompatManagerTool {
  incompatible: boolean;
}

// In the response, field 1 is a tool and field 2 an alias such as "Proton
// Stable". Both are valid choices for SpecifyCompatTool.
const FIELD_TOOL = 1;
const FIELD_ALIAS = 2;

const TOOL_NAME = 1;
const TOOL_DISPLAY_NAME = 2;
const TOOL_INCOMPATIBLE = 6;

class CompatToolsResponse {
  tools: ParsedTool[] = [];

  static deserializeBinaryFromReader(response: CompatToolsResponse, reader: BinaryReader): void {
    while (reader.nextField() && !reader.isEndGroup()) {
      const field = reader.getFieldNumber();
      if (field !== FIELD_TOOL && field !== FIELD_ALIAS) {
        reader.skipField();
        continue;
      }

      const tool: ParsedTool = { strToolName: "", strDisplayName: "", incompatible: false };
      reader.readMessage(tool, (item, fields) => {
        while (fields.nextField() && !fields.isEndGroup()) {
          const number = fields.getFieldNumber();
          if (number === TOOL_NAME) item.strToolName = fields.readString();
          else if (number === TOOL_DISPLAY_NAME) item.strDisplayName = fields.readString();
          else if (number === TOOL_INCOMPATIBLE && field === FIELD_TOOL) item.incompatible = fields.readBool();
          else fields.skipField();
        }
      });
      response.tools.push(tool);
    }
  }
}

interface SteamResponse {
  BIsValid(): boolean;
  BSuccess(): boolean;
  GetErrorMessage(): string;
  Body(): CompatToolsResponse;
}

interface Transport {
  SendMsg(
    method: string,
    request: unknown,
    response: typeof CompatToolsResponse,
    options: { ePrivilege: number; eClientExecutionSite: number },
  ): Promise<SteamResponse>;
}

interface ProtoMessage {
  Init(body: new () => { serializeBinary(): Uint8Array }): unknown;
}

export async function getCompatManagerTools(): Promise<CompatManagerTool[]> {
  const transport = findModuleExport(
    (value) => value?.SendMsg && value?.GetConnectionDetails,
  ) as Transport | undefined;
  const message = findModuleExport(
    (value) => value?.Init && value?.InitFromMsg && value?.InitFromPacket,
  ) as ProtoMessage | undefined;
  const protobuf = findModule((value) => value?.BinaryWriter && value?.BinaryReader) as
    | { BinaryWriter: new () => BinaryWriter }
    | undefined;

  if (!transport || !message || !protobuf) {
    throw new Error("Steam's CompatManager service was not found");
  }

  const { BinaryWriter: Writer } = protobuf;
  class EmptyRequest {
    serializeBinary(): Uint8Array {
      return new Writer().getResultBuffer();
    }
  }

  const response = await transport.SendMsg(
    "CompatManager.GetCompatTools#1",
    message.Init(EmptyRequest),
    CompatToolsResponse,
    { ePrivilege: 1, eClientExecutionSite: 2 },
  );
  if (!response.BIsValid() || !response.BSuccess()) {
    throw new Error(response.GetErrorMessage());
  }

  return response
    .Body()
    .tools.filter((tool) => tool.strToolName && !tool.incompatible)
    .map(({ strToolName, strDisplayName }) => ({
      strToolName,
      strDisplayName: strDisplayName || strToolName,
    }));
}
