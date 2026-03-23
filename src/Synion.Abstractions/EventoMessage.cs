namespace Synion.Abstractions;

public sealed record EventoMessage(
    string Type,
    object Data,
    IReadOnlyDictionary<string, string> Metadata);