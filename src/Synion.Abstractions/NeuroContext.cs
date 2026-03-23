namespace Synion.Abstractions;

public sealed class NeuroContext
{
    public EventoMessage Event { get; init; } = null!;
    public object? DomainState { get; init; }
    public object? MemoryState { get; init; }
    public CancellationToken CancellationToken { get; init; }
}