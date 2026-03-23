namespace Synion.Abstractions;

public sealed record CommandMessage(
    string Type,
    object Data,
    IReadOnlyDictionary<string, string> Metadata);