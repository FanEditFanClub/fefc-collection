.class public Lcom/fefc/kodi/FefcUpdateActivity;
.super Landroid/app/Activity;
.source "FefcUpdateActivity.java"

# Hands a downloaded FEFC APK to the system installer.
# Kodi's StartAndroidActivity always calls Intent.setPackage on the first argument, so an
# empty package cannot resolve the system installer and the screen only flashes. This
# activity runs inside whichever APK is installed (org.xbmc.kodi or com.fefc.kodi) and
# starts the installer without pinning that package.


# direct methods
.method public constructor <init>()V
    .registers 1

    invoke-direct {p0}, Landroid/app/Activity;-><init>()V

    return-void
.end method

.method private toast(Ljava/lang/String;)V
    .registers 3

    const/4 v0, 0x1

    invoke-static {p0, p1, v0}, Landroid/widget/Toast;->makeText(Landroid/content/Context;Ljava/lang/CharSequence;I)Landroid/widget/Toast;

    move-result-object p1

    invoke-virtual {p1}, Landroid/widget/Toast;->show()V

    return-void
.end method

.method private candidate(Ljava/io/File;)Ljava/lang/String;
    .registers 4

    if-eqz p1, :none

    new-instance v0, Ljava/io/File;

    const-string v1, "FEFC-update.apk"

    invoke-direct {v0, p1, v1}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V

    invoke-virtual {v0}, Ljava/io/File;->isFile()Z

    move-result v1

    if-eqz v1, :none

    invoke-virtual {v0}, Ljava/io/File;->getAbsolutePath()Ljava/lang/String;

    move-result-object v0

    return-object v0

    :none
    const/4 v0, 0x0

    return-object v0
.end method

.method private findApk()Ljava/lang/String;
    .registers 3

    const/4 v0, 0x0

    invoke-virtual {p0, v0}, Landroid/content/Context;->getExternalFilesDir(Ljava/lang/String;)Ljava/io/File;

    move-result-object v1

    invoke-direct {p0, v1}, Lcom/fefc/kodi/FefcUpdateActivity;->candidate(Ljava/io/File;)Ljava/lang/String;

    move-result-object v1

    if-eqz v1, :files

    return-object v1

    :files
    invoke-virtual {p0}, Landroid/content/Context;->getFilesDir()Ljava/io/File;

    move-result-object v1

    invoke-direct {p0, v1}, Lcom/fefc/kodi/FefcUpdateActivity;->candidate(Ljava/io/File;)Ljava/lang/String;

    move-result-object v1

    if-eqz v1, :cache

    return-object v1

    :cache
    invoke-virtual {p0}, Landroid/content/Context;->getCacheDir()Ljava/io/File;

    move-result-object v1

    invoke-direct {p0, v1}, Lcom/fefc/kodi/FefcUpdateActivity;->candidate(Ljava/io/File;)Ljava/lang/String;

    move-result-object v1

    if-eqz v1, :extcache

    return-object v1

    :extcache
    invoke-virtual {p0}, Landroid/content/Context;->getExternalCacheDir()Ljava/io/File;

    move-result-object v1

    invoke-direct {p0, v1}, Lcom/fefc/kodi/FefcUpdateActivity;->candidate(Ljava/io/File;)Ljava/lang/String;

    move-result-object v1

    return-object v1
.end method

.method private uriFor(Ljava/lang/String;)Landroid/net/Uri;
    .registers 6

    new-instance v0, Ljava/io/File;

    invoke-direct {v0, p1}, Ljava/io/File;-><init>(Ljava/lang/String;)V

    sget v1, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v2, 0x18

    if-lt v1, v2, :fileuri

    invoke-virtual {p0}, Landroid/content/Context;->getPackageName()Ljava/lang/String;

    move-result-object v1

    new-instance v2, Ljava/lang/StringBuilder;

    invoke-direct {v2}, Ljava/lang/StringBuilder;-><init>()V

    invoke-virtual {v2, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    const-string v1, ".fefcupdate"

    invoke-virtual {v2, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v2}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v1

    :try_start_fp
    invoke-static {p0, v1, v0}, Landroidx/core/content/FileProvider;->getUriForFile(Landroid/content/Context;Ljava/lang/String;Ljava/io/File;)Landroid/net/Uri;

    move-result-object v0
    :try_end_fp
    .catch Ljava/lang/Exception; {:try_start_fp .. :try_end_fp} :nourl

    return-object v0

    :nourl
    const/4 v0, 0x0

    return-object v0

    :fileuri
    invoke-static {v0}, Landroid/net/Uri;->fromFile(Ljava/io/File;)Landroid/net/Uri;

    move-result-object v0

    return-object v0
.end method

.method private sameApp(Ljava/lang/String;)Z
    .registers 5

    invoke-virtual {p0}, Landroid/content/Context;->getPackageManager()Landroid/content/pm/PackageManager;

    move-result-object v0

    const/4 v1, 0x0

    invoke-virtual {v0, p1, v1}, Landroid/content/pm/PackageManager;->getPackageArchiveInfo(Ljava/lang/String;I)Landroid/content/pm/PackageInfo;

    move-result-object v0

    if-nez v0, :ok

    const/4 v0, 0x0

    return v0

    :ok
    iget-object v0, v0, Landroid/content/pm/PackageInfo;->packageName:Ljava/lang/String;

    invoke-virtual {p0}, Landroid/content/Context;->getPackageName()Ljava/lang/String;

    move-result-object v1

    invoke-virtual {v1, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    return v0
.end method

.method private openInstaller(Landroid/net/Uri;)Z
    .registers 6

    const v0, 0x10000001

    new-instance v1, Landroid/content/Intent;

    const-string v2, "android.intent.action.VIEW"

    invoke-direct {v1, v2}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V

    const-string v2, "application/vnd.android.package-archive"

    invoke-virtual {v1, p1, v2}, Landroid/content/Intent;->setDataAndType(Landroid/net/Uri;Ljava/lang/String;)Landroid/content/Intent;

    invoke-virtual {v1, v0}, Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;

    :try_start_view
    invoke-virtual {p0, v1}, Landroid/app/Activity;->startActivity(Landroid/content/Intent;)V
    :try_end_view
    .catch Ljava/lang/Exception; {:try_start_view .. :try_end_view} :try_install

    const/4 v0, 0x1

    return v0

    :try_install
    new-instance v1, Landroid/content/Intent;

    const-string v2, "android.intent.action.INSTALL_PACKAGE"

    invoke-direct {v1, v2}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V

    invoke-virtual {v1, p1}, Landroid/content/Intent;->setData(Landroid/net/Uri;)Landroid/content/Intent;

    const v2, 0x10000001

    invoke-virtual {v1, v2}, Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;

    const-string v2, "android.intent.extra.NOT_UNKNOWN_SOURCE"

    const/4 v3, 0x1

    invoke-virtual {v1, v2, v3}, Landroid/content/Intent;->putExtra(Ljava/lang/String;Z)Landroid/content/Intent;

    :try_start_ip
    invoke-virtual {p0, v1}, Landroid/app/Activity;->startActivity(Landroid/content/Intent;)V
    :try_end_ip
    .catch Ljava/lang/Exception; {:try_start_ip .. :try_end_ip} :failed

    const/4 v0, 0x1

    return v0

    :failed
    const/4 v0, 0x0

    return v0
.end method

.method private explainBlocked()V
    .registers 5

    sget v0, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v1, 0x1a

    if-lt v0, v1, :plain

    invoke-virtual {p0}, Landroid/content/Context;->getPackageManager()Landroid/content/pm/PackageManager;

    move-result-object v0

    :try_start_can
    invoke-virtual {v0}, Landroid/content/pm/PackageManager;->canRequestPackageInstalls()Z

    move-result v0
    :try_end_can
    .catch Ljava/lang/Exception; {:try_start_can .. :try_end_can} :plain

    if-nez v0, :plain

    new-instance v0, Landroid/content/Intent;

    const-string v1, "android.settings.MANAGE_UNKNOWN_APP_SOURCES"

    invoke-direct {v0, v1}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V

    new-instance v1, Ljava/lang/StringBuilder;

    invoke-direct {v1}, Ljava/lang/StringBuilder;-><init>()V

    const-string v2, "package:"

    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {p0}, Landroid/content/Context;->getPackageName()Ljava/lang/String;

    move-result-object v2

    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v1}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v1

    invoke-static {v1}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;

    move-result-object v1

    invoke-virtual {v0, v1}, Landroid/content/Intent;->setData(Landroid/net/Uri;)Landroid/content/Intent;

    const v1, 0x10000000

    invoke-virtual {v0, v1}, Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;

    :try_start_set
    invoke-virtual {p0, v0}, Landroid/app/Activity;->startActivity(Landroid/content/Intent;)V
    :try_end_set
    .catch Ljava/lang/Exception; {:try_start_set .. :try_end_set} :plain

    const-string v0, "Android blocked the installer. Allow this app to install unknown apps, then press Update again. Your list and settings were not changed."

    invoke-direct {p0, v0}, Lcom/fefc/kodi/FefcUpdateActivity;->toast(Ljava/lang/String;)V

    return-void

    :plain
    const-string v0, "This device did not open an installer. Your list and settings were not changed."

    invoke-direct {p0, v0}, Lcom/fefc/kodi/FefcUpdateActivity;->toast(Ljava/lang/String;)V

    return-void
.end method


# virtual methods
.method protected onCreate(Landroid/os/Bundle;)V
    .registers 4

    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    invoke-direct {p0}, Lcom/fefc/kodi/FefcUpdateActivity;->findApk()Ljava/lang/String;

    move-result-object v0

    if-nez v0, :gone

    const-string v0, "The update file is missing. Press Update again."

    invoke-direct {p0, v0}, Lcom/fefc/kodi/FefcUpdateActivity;->toast(Ljava/lang/String;)V

    invoke-virtual {p0}, Landroid/app/Activity;->finish()V

    return-void

    :gone
    invoke-direct {p0, v0}, Lcom/fefc/kodi/FefcUpdateActivity;->sameApp(Ljava/lang/String;)Z

    move-result v1

    if-nez v1, :other

    const-string v0, "The downloaded file is not a valid update for this app, so it was not installed. Your list and settings were not changed."

    invoke-direct {p0, v0}, Lcom/fefc/kodi/FefcUpdateActivity;->toast(Ljava/lang/String;)V

    invoke-virtual {p0}, Landroid/app/Activity;->finish()V

    return-void

    :other
    invoke-direct {p0, v0}, Lcom/fefc/kodi/FefcUpdateActivity;->uriFor(Ljava/lang/String;)Landroid/net/Uri;

    move-result-object v0

    if-nez v0, :hasuri

    invoke-direct {p0}, Lcom/fefc/kodi/FefcUpdateActivity;->explainBlocked()V

    invoke-virtual {p0}, Landroid/app/Activity;->finish()V

    return-void

    :hasuri
    invoke-direct {p0, v0}, Lcom/fefc/kodi/FefcUpdateActivity;->openInstaller(Landroid/net/Uri;)Z

    move-result v0

    if-eqz v0, :blocked

    const-string v0, "Opening the app installer. If Android says it was not installed, the file is signed differently. Your list and settings stay."

    invoke-direct {p0, v0}, Lcom/fefc/kodi/FefcUpdateActivity;->toast(Ljava/lang/String;)V

    invoke-virtual {p0}, Landroid/app/Activity;->finish()V

    return-void

    :blocked
    invoke-direct {p0}, Lcom/fefc/kodi/FefcUpdateActivity;->explainBlocked()V

    invoke-virtual {p0}, Landroid/app/Activity;->finish()V

    return-void
.end method
