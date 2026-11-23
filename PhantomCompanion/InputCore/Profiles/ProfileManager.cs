using System.Text.Json;

namespace PhantomCompanion.InputCore.Profiles;

public sealed class ProfileStoreData
{
    public string ActiveProfileId { get; set; } = "builtin-default";
    public List<ControllerProfile> Profiles { get; set; } = new();
}

public sealed class ProfileManager
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    private readonly string _storePath;
    private readonly List<ControllerProfile> _profiles = new();
    private string _activeProfileId = "builtin-default";

    public event Action<ControllerProfile>? ActiveProfileChanged;
    public event Action? ProfilesUpdated;

    public ProfileManager(string? customStorePath = null)
    {
        _storePath = customStorePath ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "PhantomCompanion",
            "profiles.json");
        LoadOrInitialize();
    }

    public IReadOnlyList<ControllerProfile> Profiles => _profiles.AsReadOnly();

    public ControllerProfile ActiveProfile =>
        _profiles.FirstOrDefault(p => p.Id == _activeProfileId) ?? _profiles[0];

    public void LoadOrInitialize()
    {
        _profiles.Clear();
        if (File.Exists(_storePath))
        {
            try
            {
                var json = File.ReadAllText(_storePath);
                var data = JsonSerializer.Deserialize<ProfileStoreData>(json, JsonOpts);
                if (data?.Profiles is { Count: > 0 })
                {
                    _profiles.AddRange(data.Profiles);
                    _activeProfileId = data.ActiveProfileId;
                }
            }
            catch
            {
                // Corrupt store falls back cleanly to built-in defaults
            }
        }

        EnsureBuiltInsPresent();
        if (_profiles.All(p => p.Id != _activeProfileId))
        {
            _activeProfileId = _profiles[0].Id;
        }
        Save();
    }

    private void EnsureBuiltInsPresent()
    {
        if (!_profiles.Any(p => p.BuiltInKey == "default"))
            _profiles.Insert(0, ControllerProfile.CreateDefaultController());
        if (!_profiles.Any(p => p.BuiltInKey == "battlegrounds"))
            _profiles.Insert(1, ControllerProfile.CreateBattlegrounds());
        if (!_profiles.Any(p => p.BuiltInKey == "custom"))
            _profiles.Insert(2, ControllerProfile.CreateCustomTemplate());
    }

    public void SelectProfile(string profileId)
    {
        var target = _profiles.FirstOrDefault(p => p.Id == profileId);
        if (target is null) return;
        _activeProfileId = target.Id;
        Save();
        ActiveProfileChanged?.Invoke(target);
    }

    public ControllerProfile CreateProfile(string name, OutputMode mode)
    {
        var cleanName = string.IsNullOrWhiteSpace(name) ? "New Profile" : name.Trim();
        var profile = new ControllerProfile
        {
            Id = "custom-" + Guid.NewGuid().ToString("N")[..8],
            Name = cleanName,
            IsBuiltIn = false,
            OutputMode = mode
        };
        _profiles.Add(profile);
        _activeProfileId = profile.Id;
        Save();
        ProfilesUpdated?.Invoke();
        ActiveProfileChanged?.Invoke(profile);
        return profile;
    }

    public ControllerProfile DuplicateProfile(string sourceId, string? newName = null)
    {
        var src = _profiles.FirstOrDefault(p => p.Id == sourceId) ?? ActiveProfile;
        var json = JsonSerializer.Serialize(src, JsonOpts);
        var copy = JsonSerializer.Deserialize<ControllerProfile>(json, JsonOpts)!;
        copy.Id = "custom-" + Guid.NewGuid().ToString("N")[..8];
        copy.IsBuiltIn = false;
        copy.BuiltInKey = string.Empty;
        copy.Name = string.IsNullOrWhiteSpace(newName) ? $"{src.Name} Copy" : newName.Trim();
        _profiles.Add(copy);
        _activeProfileId = copy.Id;
        Save();
        ProfilesUpdated?.Invoke();
        ActiveProfileChanged?.Invoke(copy);
        return copy;
    }

    public bool RenameProfile(string profileId, string newName)
    {
        var target = _profiles.FirstOrDefault(p => p.Id == profileId);
        if (target is null || string.IsNullOrWhiteSpace(newName)) return false;
        target.Name = newName.Trim();
        Save();
        ProfilesUpdated?.Invoke();
        return true;
    }

    public bool DeleteCustomProfile(string profileId)
    {
        var target = _profiles.FirstOrDefault(p => p.Id == profileId);
        if (target is null || target.IsBuiltIn) return false;

        _profiles.Remove(target);
        if (_activeProfileId == profileId)
        {
            _activeProfileId = _profiles[0].Id;
            ActiveProfileChanged?.Invoke(ActiveProfile);
        }
        Save();
        ProfilesUpdated?.Invoke();
        return true;
    }

    public ControllerProfile? ResetBuiltInProfile(string profileId)
    {
        var idx = _profiles.FindIndex(p => p.Id == profileId && p.IsBuiltIn);
        if (idx < 0) return null;

        var key = _profiles[idx].BuiltInKey;
        var fresh = key switch
        {
            "battlegrounds" => ControllerProfile.CreateBattlegrounds(),
            "custom" => ControllerProfile.CreateCustomTemplate(),
            _ => ControllerProfile.CreateDefaultController()
        };
        _profiles[idx] = fresh;
        Save();
        ProfilesUpdated?.Invoke();
        if (_activeProfileId == fresh.Id)
        {
            ActiveProfileChanged?.Invoke(fresh);
        }
        return fresh;
    }

    public string ExportProfileJson(string profileId)
    {
        var target = _profiles.FirstOrDefault(p => p.Id == profileId) ?? ActiveProfile;
        return JsonSerializer.Serialize(target, JsonOpts);
    }

    public ControllerProfile ImportProfileJson(string json)
    {
        var imported = JsonSerializer.Deserialize<ControllerProfile>(json, JsonOpts)
            ?? throw new InvalidDataException("Invalid profile JSON.");
        imported.Id = "custom-" + Guid.NewGuid().ToString("N")[..8];
        imported.IsBuiltIn = false;
        imported.BuiltInKey = string.Empty;
        if (string.IsNullOrWhiteSpace(imported.Name))
        {
            imported.Name = "Imported Profile";
        }
        _profiles.Add(imported);
        _activeProfileId = imported.Id;
        Save();
        ProfilesUpdated?.Invoke();
        ActiveProfileChanged?.Invoke(imported);
        return imported;
    }

    public void Save()
    {
        var dir = Path.GetDirectoryName(_storePath);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }
        var data = new ProfileStoreData
        {
            ActiveProfileId = _activeProfileId,
            Profiles = _profiles
        };
        File.WriteAllText(_storePath, JsonSerializer.Serialize(data, JsonOpts));
    }
}
